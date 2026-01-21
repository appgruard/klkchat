import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { insertUserSchema, insertMessageSchema } from "@shared/schema";
import type { User, UserPublic } from "@shared/schema";
import { z } from "zod";
import { randomBytes } from "crypto";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import webpush from "web-push";
import multer from "multer";
import path from "path";
import fs from "fs";
import { 
  moderateContent, 
  generatePseudonym, 
  RATE_LIMITS, 
  MAX_MESSAGES_PER_24H,
  MAX_AUDIO_DURATION,
  SILENCE_DURATION_HOURS,
  BLOCKS_BEFORE_SILENCE
} from "./community-moderation";
import { findNearbyPlaces } from "./geopify";

import nodemailer from "nodemailer";

const SALT_ROUNDS = 12;

// Configure nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.fourone.com.do",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_EMAIL = "info@fourone.com.do";

// Configure multer for file uploads
const uploadDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// Configure web-push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:support@fourone.com.do",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn("VAPID keys not configured, push notifications will be disabled");
}

// WebSocket clients map: userId -> WebSocket
const wsClients = new Map<string, WebSocket>();

// Helper to remove password from user object
function sanitizeUser(user: User): UserPublic {
  const { password, ...publicUser } = user;
  return publicUser;
}

// Auth middleware
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Session setup with PostgreSQL store
  const PgSession = connectPgSimple(session);
  
  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "sessions",
        createTableIfMissing: true,
      }),
      proxy: true,
      secret: process.env.SESSION_SECRET || "four-one-solutions-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    })
  );

  // Passport setup
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Invalid credentials" });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          return done(null, false, { message: "Invalid credentials" });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || null);
    } catch (error) {
      done(error);
    }
  });

  // Auth routes
  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(sanitizeUser(req.user as User));
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);

      const existing = await storage.getUserByUsername(data.username);
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
      const user = await storage.createUser({
        ...data,
        password: hashedPassword,
        isAnonymous: false,
      });

      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login failed" });
        }
        res.json(sanitizeUser(user));
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/register-anonymous", async (req, res) => {
    try {
      const randomId = randomBytes(4).toString("hex");
      const username = `anon_${randomId}`;
      const password = randomBytes(16).toString("hex");
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      const user = await storage.createUser({
        username,
        password: hashedPassword,
        displayName: `Anonymous User`,
        isAnonymous: true,
      });

      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login failed" });
        }
        res.json(sanitizeUser(user));
      });
    } catch (error) {
      console.error("Anonymous registration error:", error);
      res.status(500).json({ message: "Failed to create anonymous session" });
    }
  });

  app.post("/api/auth/convert-anonymous", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (!user.isAnonymous) {
        return res.status(400).json({ message: "Account is not anonymous" });
      }

      const { username, password } = req.body;

      const parseResult = insertUserSchema.pick({ username: true, password: true }).safeParse({ username, password });
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0].message });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const updatedUser = await storage.updateUser(user.id, {
        username,
        password: hashedPassword,
        isAnonymous: false,
      });

      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update account" });
      }

      res.json(sanitizeUser(updatedUser));
    } catch (error) {
      console.error("Convert anonymous error:", error);
      res.status(500).json({ message: "Failed to convert account" });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: User | false, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Login failed" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }

      req.login(user, async (loginErr) => {
        if (loginErr) {
          return res.status(500).json({ message: "Login failed" });
        }
        await storage.setUserOnline(user.id, true);
        res.json(sanitizeUser(user));
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    const user = req.user as User;
    await storage.setUserOnline(user.id, false);
    
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out" });
    });
  });

  app.post("/api/auth/public-key", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { publicKey } = req.body;

      if (!publicKey || typeof publicKey !== "string") {
        return res.status(400).json({ message: "Invalid public key" });
      }

      const updatedUser = await storage.updateUser(user.id, { publicKey });
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update public key" });
      }

      res.json(sanitizeUser(updatedUser));
    } catch (error) {
      console.error("Update public key error:", error);
      res.status(500).json({ message: "Failed to update public key" });
    }
  });

  app.patch("/api/auth/profile", requireAuth, upload.single("avatar"), async (req, res) => {
    try {
      const user = req.user as User;
      const { displayName, email } = req.body;
      const avatarFile = req.file;

      const updates: Partial<User> = {};
      
      if (displayName !== undefined) {
        const trimmedName = displayName.trim();
        if (trimmedName.length === 0) {
          return res.status(400).json({ message: "Display name is required" });
        }
        if (trimmedName.length > 50) {
          return res.status(400).json({ message: "Display name must be less than 50 characters" });
        }
        updates.displayName = trimmedName;
      }

      if (email !== undefined) {
        if (email && email.trim() !== "") {
          const emailSchema = z.string().email();
          const parseResult = emailSchema.safeParse(email.trim());
          if (!parseResult.success) {
            return res.status(400).json({ message: "Invalid email" });
          }
          const trimmedEmail = email.trim();
          if (user.email !== trimmedEmail) {
            updates.email = trimmedEmail;
            updates.emailVerified = false;
          }
        } else {
          updates.email = null;
          updates.emailVerified = false;
        }
      }

      if (avatarFile) {
        updates.avatarUrl = `/uploads/${avatarFile.filename}`;
      } else if (req.body.avatarUrl !== undefined) {
        updates.avatarUrl = req.body.avatarUrl || null;
      }

      const updatedUser = await storage.updateUser(user.id, updates);
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update profile" });
      }

      res.json(sanitizeUser(updatedUser));
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Change password
  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
      const updatedUser = await storage.updateUser(user.id, { password: hashedPassword });
      
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to change password" });
      }

      // Regenerate session to invalidate old sessions after password change
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
        }
        req.login(updatedUser, (loginErr) => {
          if (loginErr) {
            console.error("Re-login error:", loginErr);
            return res.json({ message: "Password changed successfully. Please log in again." });
          }
          res.json({ message: "Password changed successfully" });
        });
      });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  const getEmailTemplate = (title: string, content: string, actionText?: string, actionUrl?: string) => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; background-color: #fcfcfc; }
          .container { max-width: 600px; margin: 20px auto; padding: 40px; border: 1px solid #e5e5e5; border-radius: 12px; background-color: #ffffff; }
          .header { text-align: center; padding-bottom: 30px; }
          .logo-img { width: 64px; height: 64px; margin-bottom: 10px; }
          .logo-text { font-size: 24px; font-weight: 700; color: #1a1a1a; display: block; text-decoration: none; }
          .content { padding: 20px 0; border-top: 1px solid #f0f0f0; }
          .footer { text-align: center; font-size: 12px; color: #666; padding-top: 30px; border-top: 1px solid #f0f0f0; margin-top: 20px; }
          .button { display: inline-block; padding: 12px 32px; background-color: #1a1a1a; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 24px; }
          .code-box { background: #f4f4f5; padding: 20px; border-radius: 8px; font-size: 32px; font-weight: 700; text-align: center; letter-spacing: 8px; color: #1a1a1a; margin: 24px 0; border: 1px solid #e5e5e5; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="cid:app-logo" alt="KLK! Chat" class="logo-img">
            <a href="https://${process.env.REPLIT_DEV_DOMAIN}" class="logo-text">KLK! Chat</a>
          </div>
          <div class="content">
            <h2 style="margin-top: 0;">${title}</h2>
            <div style="font-size: 16px; color: #4a4a4a;">${content}</div>
            ${actionText && actionUrl ? `<a href="${actionUrl}" class="button">${actionText}</a>` : ""}
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Four One Solutions. Todos los derechos reservados.</p>
            <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const sendMailWithLogo = async (options: any) => {
    const logoPath = path.resolve(process.cwd(), 'uploads/app-logo.png');
    const attachments = [...(options.attachments || [])];
    
    if (fs.existsSync(logoPath)) {
      attachments.push({
        filename: 'logo.png',
        path: logoPath,
        cid: 'app-logo'
      });
    }

    return transporter.sendMail({
      ...options,
      attachments
    });
  };

  app.post("/api/test-email", requireAuth, async (req, res) => {
    try {
      const { to } = req.body;
      if (!to) return res.status(400).json({ message: "Recipient email is required" });

      await sendMailWithLogo({
        from: FROM_EMAIL,
        to: to,
        subject: "Correo de Prueba - KLK! Chat",
        text: "Este es un correo de prueba para verificar la configuración SMTP.",
        html: getEmailTemplate(
          "Correo de Prueba",
          "Este es un correo de prueba para verificar que la configuración de mensajería está funcionando correctamente con el nuevo diseño."
        ),
      });

      res.json({ message: "Test email sent successfully" });
    } catch (error) {
      console.error("Test email error:", error);
      res.status(500).json({ message: "Failed to send test email", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/api/admin/zones/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (!user.isAdmin && user.username !== 'KlkCEO' && user.username !== 'mysticFoxyy') {
        return res.status(403).json({ message: "Forbidden" });
      }

      const id = req.params.id;
      const updatedZone = await storage.updateCommunityZone(id, req.body);
      if (!updatedZone) {
        return res.status(404).json({ message: "Zone not found" });
      }

      res.json(updatedZone);
    } catch (error) {
      console.error("Update zone error:", error);
      res.status(500).json({ message: "Failed to update zone" });
    }
  });

  app.post("/api/admin/zones/discover", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (!user.isAdmin && user.username !== 'KlkCEO' && user.username !== 'mysticFoxyy') {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { lat, lng } = req.body;
      if (!lat || !lng) {
        return res.status(400).json({ message: "Latitude and longitude are required" });
      }

      const places = await findNearbyPlaces(lat, lng);
      const createdZones = [];

      for (const place of places) {
        // Check if a zone with similar name and location already exists
        const existingZones = await storage.getCommunityZones();
        const duplicate = existingZones.find(z => 
          z.name === place.name || 
          (Math.abs(z.centerLat - place.centerLat) < 0.0001 && Math.abs(z.centerLng - place.centerLng) < 0.0001)
        );

        if (!duplicate) {
          const newZone = await storage.createCommunityZone(place);
          createdZones.push(newZone);
        }
      }

      res.json({ 
        message: `Discovered and created ${createdZones.length} new zones`,
        zones: createdZones 
      });
    } catch (error) {
      console.error("Zone discovery error:", error);
      res.status(500).json({ message: "Failed to discover zones" });
    }
  });

  // User routes
  app.use("/uploads", express.static(uploadDir));

  // WebSocket server setup
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    session({
      store: new PgSession({
        pool,
        tableName: "sessions",
        createTableIfMissing: true,
      }),
      proxy: true,
      secret: process.env.SESSION_SECRET || "four-one-solutions-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    })(request as any, {} as any, () => {
      if (!request.url?.startsWith("/ws")) {
        socket.destroy();
        return;
      }

      const url = new URL(request.url, `http://${request.headers.host}`);
      const userId = url.searchParams.get("userId");

      if (!userId) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request, userId);
      });
    });
  });

  wss.on("connection", (ws: WebSocket, _request: any, userId: string) => {
    wsClients.set(userId, ws);
    
    // Broadcast online status
    const broadcastStatus = (type: "online" | "offline") => {
      wsClients.forEach((client, id) => {
        if (id !== userId && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type, payload: { userId } }));
        }
      });
    };

    broadcastStatus("online");

    ws.on("close", () => {
      wsClients.delete(userId);
      broadcastStatus("offline");
    });

    ws.on("error", () => {
      wsClients.delete(userId);
      broadcastStatus("offline");
    });
  });

  app.post("/api/auth/verify-email", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const targetEmail = user.email || "admin@fourone.com.do";
      
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      await storage.createRecoveryCode({
        userId: user.id,
        code: verificationCode,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
      });

      console.log(`Sending verification email to: ${targetEmail}`);
      const info = await sendMailWithLogo({
        from: FROM_EMAIL,
        to: targetEmail,
        subject: "Verificación de Correo - KLK! Chat",
        text: `Tu código de verificación es: ${verificationCode}`,
        html: getEmailTemplate(
          "Verifica tu correo",
          `Gracias por unirte a KLK! Chat. Usa el siguiente código para verificar tu dirección de correo electrónico:
          <div class="code-box">${verificationCode}</div>
          Este código expirará en 15 minutos.`
        ),
      });
      console.log("Verification email sent:", info.messageId);

      res.json({ message: "Verification code sent" });
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ message: "Failed to send verification email", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/auth/confirm-email", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { code } = req.body;
      const validCode = await storage.getValidRecoveryCode(user.id, code);
      if (!validCode) return res.status(400).json({ message: "Código inválido o expirado" });

      await storage.markRecoveryCodeUsed(validCode.id);
      await storage.updateUser(user.id, { emailVerified: true });
      res.json({ message: "Email verified successfully" });
    } catch (error) {
      res.status(500).json({ message: "Verification failed" });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      const [user] = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      await storage.createRecoveryCode({
        userId: user.id,
        code: resetCode,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      console.log(`Sending recovery email to: ${email}`);
      const info = await sendMailWithLogo({
        from: FROM_EMAIL,
        to: email,
        subject: "Recuperación de Contraseña - KLK! Chat",
        text: `Tu código para restablecer la contraseña es: ${resetCode}`,
        html: getEmailTemplate(
          "Recupera tu contraseña",
          `Hemos recibido una solicitud para restablecer tu contraseña. Usa el siguiente código para completar el proceso:
          <div class="code-box">${resetCode}</div>
          Si no solicitaste este cambio, puedes ignorar este correo.`
        ),
      });
      console.log("Recovery email sent:", info.messageId);

      res.json({ message: "Reset code sent" });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Failed to send reset code", error: error instanceof Error ? error.message : String(error) });
    }
  });
  // Delete account
  app.post("/api/auth/delete-account", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Incorrect password" });
      }

      await storage.deleteUser(user.id);
      
      req.logout((err) => {
        if (err) {
          console.error("Logout error during account deletion:", err);
        }
        res.json({ message: "Account deleted successfully" });
      });
    } catch (error) {
      console.error("Delete account error:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  app.post("/api/users/:id/block", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      await storage.blockUser(user.id, id);
      console.log(`API: User ${user.id} blocked ${id}`);
      res.json({ message: "User blocked successfully" });
    } catch (error) {
      console.error("Block user error:", error);
      res.status(500).json({ message: "Failed to block user" });
    }
  });

  app.get("/api/users/blocked", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const blockedUsers = await storage.getBlockedUsersDetailed(user.id);
      // Log for debugging
      console.log(`API: Sending ${blockedUsers.length} blocked users for user ${user.id}`);
      res.json(blockedUsers);
    } catch (error) {
      console.error("Get blocked users error:", error);
      res.status(500).json({ message: "Failed to get blocked users" });
    }
  });

  app.post("/api/users/:id/unblock", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      await storage.unblockUser(user.id, id);
      res.json({ message: "User unblocked successfully" });
    } catch (error) {
      console.error("Unblock user error:", error);
      res.status(500).json({ message: "Failed to unblock user" });
    }
  });

  app.get("/api/users/search/:query", requireAuth, async (req, res) => {
    try {
      const { query } = req.params as { query: string };
      if (query.length < 2) {
        return res.json([]);
      }
      const users = await storage.searchUsers(query, (req.user as User).id);
      res.json(users);
    } catch (error) {
      console.error("User search error:", error);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // Conversation routes
  app.get("/api/conversations", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const conversations = await storage.getConversationsForUser(user.id);
      res.json(conversations);
    } catch (error) {
      console.error("Get conversations error:", error);
      res.status(500).json({ message: "Failed to get conversations" });
    }
  });

  app.get("/api/conversations/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      const conversation = await storage.getConversationWithParticipants(id, user.id);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // Check if user is a participant
      const isParticipant = conversation.participants.some((p) => p.id === user.id);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(conversation);
    } catch (error) {
      console.error("Get conversation error:", error);
      res.status(500).json({ message: "Failed to get conversation" });
    }
  });

  app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      
      // Verify participation
      const conversation = await storage.getConversationWithParticipants(id, user.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const isParticipant = conversation.participants.some(p => p.id === user.id);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
      }

      const messages = await storage.getMessagesForConversation(id);
      res.json(messages);
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ message: "Failed to get messages" });
    }
  });

  app.post("/api/conversations/:id/read", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      await storage.markMessagesAsRead(id, user.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark as read error:", error);
      res.status(500).json({ message: "Failed to mark messages as read" });
    }
  });

  app.delete("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      
      const conversation = await storage.getConversationWithParticipants(id, user.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const isParticipant = conversation.participants.some(p => p.id === user.id);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.clearMessagesForConversation(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Clear chat error:", error);
      res.status(500).json({ message: "Failed to clear chat" });
    }
  });

  app.post("/api/conversations", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { participantId } = req.body;

      if (!participantId || participantId === user.id) {
        return res.status(400).json({ message: "Invalid participant" });
      }

      // Check if participant exists
      const participant = await storage.getUser(participantId);
      if (!participant) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if either user has blocked the other
      const iBlockedThem = await storage.isUserBlocked(user.id, participantId);
      const theyBlockedMe = await storage.isUserBlocked(participantId, user.id);
      if (iBlockedThem || theyBlockedMe) {
        return res.status(403).json({ message: "Cannot start conversation with this user" });
      }

      // Check for existing conversation
      const existing = await storage.findExistingConversation(user.id, participantId);
      if (existing) {
        const conv = await storage.getConversationWithParticipants(existing.id, user.id);
        return res.json(conv);
      }

      // Create new conversation
      const conversation = await storage.createConversation([user.id, participantId]);
      const conv = await storage.getConversationWithParticipants(conversation.id, user.id);
      res.json(conv);
    } catch (error) {
      console.error("Create conversation error:", error);
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.get("/api/push/key", (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
  });

  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const subscription = req.body;
      
      await storage.addPushSubscription({
        userId: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Push subscription error:", error);
      res.status(500).json({ message: "Failed to save subscription" });
    }
  });

  // File upload route
  app.post("/api/upload", requireAuth, upload.single("file"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      url: fileUrl,
      name: req.file.originalname,
      type: req.file.mimetype,
      size: req.file.size,
    });
  });

  // Optimize message sending by not waiting for storage/broadcast for response
  app.post("/api/conversations/:id/messages", requireAuth, upload.single("file"), async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      const { content, type = "text", ...extraData } = req.body;
      let fileUrl = null;

      if (req.file) {
        fileUrl = `/uploads/${req.file.filename}`;
      } else if (extraData.fileUrl) {
        fileUrl = extraData.fileUrl;
      }

      // Pre-sanitize user for response
      const sanitizedUser = sanitizeUser(user);

      // Check for blockages
      const conversationId = id as string;
      const conversation = await storage.getConversationWithParticipants(conversationId, user.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const otherParticipant = conversation.participants.find((p) => p.id !== user.id);
      if (otherParticipant) {
        const iBlockedThem = await storage.isUserBlocked(user.id, otherParticipant.id);
        const theyBlockedMe = await storage.isUserBlocked(otherParticipant.id, user.id);
        if (iBlockedThem || theyBlockedMe) {
          return res.status(403).json({ message: "Cannot send messages to this user" });
        }
      }

      // Create message in database
      const message = await storage.createMessage({
        conversationId: id,
        senderId: user.id,
        replyToId: extraData.replyToId || null,
        encryptedContent: content || "",
        iv: randomBytes(12).toString("base64"),
        fileUrl,
        fileName: req.file?.originalname || extraData.fileName,
        fileType: type !== "text" ? type : (req.file?.mimetype || extraData.fileType),
        fileSize: req.file?.size?.toString() || extraData.fileSize,
        duration: extraData.duration ? parseInt(extraData.duration) : undefined,
      });
      
      const messageWithSender = {
        ...message,
        sender: sanitizedUser,
      };

      // Ensure we emit to participants including self (to sync across tabs/devices)
      conversation.participants.forEach((participant) => {
        const ws = wsClients.get(participant.id);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "message", payload: messageWithSender }));
        } else if (participant.id !== user.id) {
          // Push notifications for offline
          storage.getPushSubscriptions(participant.id).then(subs => {
            subs.forEach(sub => {
              webpush.sendNotification({
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth }
              }, JSON.stringify({
                title: user.displayName || user.username,
                body: type === "text" ? content : "Envió un archivo",
                url: `/conversations/${id}`
              })).catch(() => {});
            });
          }).catch(() => {});
        }
      });

      // Crucial: Respond only AFTER database save is confirmed
      return res.json(messageWithSender);
    } catch (error) {
      console.error("Send message error:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // GIPHY Proxy (to protect API key)
  app.get("/api/giphy/search", requireAuth, async (req, res) => {
    try {
      const { q } = req.query;
      const apiKey = process.env.GIPHY_API_KEY || "dc6zaTOxFJmzC";
      const endpoint = q
        ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q as string)}&limit=20&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=20&rating=g`;
      const response = await fetch(endpoint);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("GIPHY proxy error:", error);
      res.status(500).json({ message: "Failed to fetch GIFs" });
    }
  });

  // Custom Stickers Routes
  app.get("/api/stickers", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const stickers = await storage.getCustomStickers(user.id);
      res.json(stickers);
    } catch (error) {
      console.error("Get stickers error:", error);
      res.status(500).json({ message: "Failed to get stickers" });
    }
  });

  app.post("/api/stickers", requireAuth, upload.single("sticker"), async (req, res) => {
    try {
      const user = req.user as User;
      const { name } = req.body;

      if (!req.file) {
        return res.status(400).json({ message: "Sticker image is required" });
      }

      const imageUrl = `/uploads/${req.file.filename}`;
      const sticker = await storage.addCustomSticker({
        userId: user.id,
        imageUrl,
        name: name || null,
      });

      res.json(sticker);
    } catch (error) {
      console.error("Add sticker error:", error);
      res.status(500).json({ message: "Failed to add sticker" });
    }
  });

  // Add sticker by URL (for external sticker packs)
  app.post("/api/stickers/url", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { url, name } = req.body;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ message: "Sticker URL is required" });
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        return res.status(400).json({ message: "Invalid URL format" });
      }

      // Validate it's an image URL (basic check)
      const validExtensions = ['.png', '.gif', '.webp', '.jpg', '.jpeg'];
      const urlLower = url.toLowerCase();
      const hasValidExtension = validExtensions.some(ext => urlLower.includes(ext));
      const isKnownStickerProvider = urlLower.includes('fonts.gstatic.com') || 
                                      urlLower.includes('giphy.com') ||
                                      urlLower.includes('telegram') ||
                                      urlLower.includes('sticker');
      
      if (!hasValidExtension && !isKnownStickerProvider) {
        return res.status(400).json({ message: "URL must point to an image file (PNG, GIF, WebP, JPG)" });
      }

      const sticker = await storage.addCustomSticker({
        userId: user.id,
        imageUrl: url,
        name: name || null,
      });

      res.json(sticker);
    } catch (error) {
      console.error("Add sticker by URL error:", error);
      res.status(500).json({ message: "Failed to add sticker" });
    }
  });

  app.delete("/api/stickers/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      await storage.deleteCustomSticker(id as string, user.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete sticker error:", error);
      res.status(500).json({ message: "Failed to delete sticker" });
    }
  });

  // Hidden Conversations Routes
  app.get("/api/hidden-conversations", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const hidden = await storage.getHiddenConversations(user.id);
      res.json(hidden.map(h => h.conversationId));
    } catch (error) {
      console.error("Get hidden conversations error:", error);
      res.status(500).json({ message: "Failed to get hidden conversations" });
    }
  });

  app.post("/api/conversations/:id/hide", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      const { pin } = req.body;

      if (!pin || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ message: "PIN must be 4 digits" });
      }

      const existing = await storage.getHiddenConversation(id as string, user.id);
      if (existing) {
        return res.status(400).json({ message: "Conversation is already hidden" });
      }

      const pinHash = await bcrypt.hash(pin, 10);
      await storage.hideConversation({
        userId: user.id,
        conversationId: id as string,
        pinHash,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Hide conversation error:", error);
      res.status(500).json({ message: "Failed to hide conversation" });
    }
  });

  app.post("/api/conversations/:id/unhide", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      const { pin } = req.body;

      const hidden = await storage.getHiddenConversation(id as string, user.id);
      if (!hidden) {
        return res.status(404).json({ message: "Conversation is not hidden" });
      }

      const isValid = await bcrypt.compare(pin, hidden.pinHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid PIN" });
      }

      await storage.unhideConversation(id as string, user.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Unhide conversation error:", error);
      res.status(500).json({ message: "Failed to unhide conversation" });
    }
  });

  app.post("/api/conversations/:id/verify-pin", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      const { pin } = req.body;

      const hidden = await storage.getHiddenConversation(id as string, user.id);
      if (!hidden) {
        return res.status(404).json({ message: "Conversation is not hidden" });
      }

      const isValid = await bcrypt.compare(pin, hidden.pinHash);
      res.json({ valid: isValid });
    } catch (error) {
      console.error("Verify PIN error:", error);
      res.status(500).json({ message: "Failed to verify PIN" });
    }
  });

  // ==================== COMMUNITY MODULE API ====================

  // Entry validation schema
  const communityEntrySchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    age: z.number().min(13).max(120),
  });

  // Enter community zone
  app.post("/api/community/entry", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { latitude, longitude, age } = communityEntrySchema.parse(req.body);

      // Find zone by location
      const zone = await storage.findZoneByLocation(latitude, longitude);
      if (!zone) {
        return res.status(404).json({ 
          message: "no_zone_nearby",
          details: "There are no community conversations in your area"
        });
      }

      // Check for existing active session
      let session = await storage.getActiveSessionForUser(user.id, zone.id);
      
      if (session) {
        // Check if expelled
        if (session.expelledUntil && new Date(session.expelledUntil) > new Date()) {
          return res.status(403).json({ 
            message: "expelled",
            expelledUntil: session.expelledUntil 
          });
        }

        // Update last location check
        await storage.updateCommunitySession(session.id, { 
          lastLocationCheck: new Date() 
        });
      } else {
        // Create new session with ephemeral identity
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        session = await storage.createCommunitySession({
          userId: user.id,
          zoneId: zone.id,
          pseudonym: generatePseudonym(),
          avatarSeed: Math.random().toString(36).substring(2, 15),
          age,
          expiresAt,
        });
      }

      res.json({
        sessionId: session.id,
        zoneId: zone.id,
        zoneName: zone.name,
        pseudonym: session.pseudonym,
        isUnder16: age < 16,
        messageCount: session.messageCount,
        silencedUntil: session.silencedUntil,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data" });
      }
      console.error("Community entry error:", error);
      res.status(500).json({ message: "Failed to enter community zone" });
    }
  });

  // Validate location (periodic check)
  app.post("/api/community/validate-location", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { sessionId, latitude, longitude } = req.body;

      const session = await storage.getCommunitySession(sessionId);
      if (!session || session.userId !== user.id) {
        return res.status(404).json({ message: "Session not found" });
      }

      const zone = await storage.getCommunityZone(session.zoneId);
      if (!zone) {
        return res.status(404).json({ message: "Zone not found" });
      }

      // Check if user is still in zone
      const userZone = await storage.findZoneByLocation(latitude, longitude);
      if (!userZone || userZone.id !== zone.id) {
        return res.json({ valid: false, message: "outside_zone" });
      }

      // Update last location check
      await storage.updateCommunitySession(session.id, { 
        lastLocationCheck: new Date() 
      });

      res.json({ valid: true });
    } catch (error) {
      console.error("Location validation error:", error);
      res.status(500).json({ message: "Failed to validate location" });
    }
  });

  app.post("/api/community/sessions/:sessionId/block", requireAuth, async (req, res) => {
    try {
      const { sessionId: targetSessionId } = req.params;
      const user = req.user as User;

      const targetSession = await storage.getCommunitySession(targetSessionId);
      if (!targetSession) {
        return res.status(404).json({ message: "Target session not found" });
      }

      if (targetSession.userId === user.id) {
        return res.status(400).json({ message: "You cannot block yourself" });
      }

      const updatedSession = await storage.updateCommunitySession(targetSessionId, {
        blockCount: (targetSession.blockCount || 0) + 1,
      });

      if (updatedSession && updatedSession.blockCount >= BLOCKS_BEFORE_SILENCE) {
        const silencedUntil = new Date();
        silencedUntil.setHours(silencedUntil.getHours() + SILENCE_DURATION_HOURS);
        await storage.updateCommunitySession(targetSessionId, {
          silencedUntil,
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Block community user error:", error);
      res.status(500).json({ message: "Failed to block user" });
    }
  });

  // Delete community message (moderators only)
  app.delete("/api/community/messages/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      
      const moderators = ['KlkCEO', 'mysticFoxyy'];
      if (!moderators.includes(user.username)) {
        return res.status(403).json({ message: "Not authorized" });
      }

      await storage.deleteCommunityMessage(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete community message error:", error);
      res.status(500).json({ message: "Failed to delete message" });
    }
  });

  // Get community messages
  app.get("/api/community/messages/:zoneId", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { zoneId } = req.params;
      const { sessionId } = req.query;

      // Verify session
      const session = await storage.getCommunitySession(sessionId as string);
      if (!session || session.userId !== user.id || session.zoneId !== zoneId) {
        return res.status(403).json({ message: "Invalid session" });
      }

      // Hide explicit content for users under 16
      const hideExplicit = session.age < 16;
      const messages = await storage.getCommunityMessages(zoneId, hideExplicit);

      res.json({ 
        messages,
        currentPseudonym: session.pseudonym 
      });
    } catch (error) {
      console.error("Get community messages error:", error);
      res.status(500).json({ message: "Failed to get messages" });
    }
  });

  // Send community message
  app.post("/api/community/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { sessionId, contentType, content, duration } = req.body;

      // Verify session
      const session = await storage.getCommunitySession(sessionId);
      if (!session || session.userId !== user.id) {
        return res.status(403).json({ message: "Invalid session" });
      }

      // Check if silenced
      if (session.silencedUntil && new Date(session.silencedUntil) > new Date()) {
        return res.status(403).json({ 
          message: "silenced",
          silencedUntil: session.silencedUntil 
        });
      }

      // Check if expelled
      if (session.expelledUntil && new Date(session.expelledUntil) > new Date()) {
        return res.status(403).json({ 
          message: "expelled",
          expelledUntil: session.expelledUntil 
        });
      }

      // Check message count limit (100 per 24h)
      if (session.messageCount >= MAX_MESSAGES_PER_24H) {
        return res.status(429).json({ 
          message: "message_limit_reached",
          details: "You have reached the maximum of 100 messages per 24 hours"
        });
      }

      // Check rate limit (cooldown)
      const cooldown = RATE_LIMITS[contentType as keyof typeof RATE_LIMITS];
      if (cooldown) {
        const lastMessageTime = await storage.getLastMessageTime(sessionId, contentType);
        if (lastMessageTime) {
          const timeSince = Date.now() - new Date(lastMessageTime).getTime();
          if (timeSince < cooldown) {
            const waitTime = Math.ceil((cooldown - timeSince) / 1000);
            return res.status(429).json({ 
              message: "rate_limited",
              waitSeconds: waitTime 
            });
          }
        }
      }

      // Check audio duration
      if (contentType === 'audio' && duration && duration > MAX_AUDIO_DURATION) {
        return res.status(400).json({ 
          message: "audio_too_long",
          maxDuration: MAX_AUDIO_DURATION 
        });
      }

      // Moderate text content
      let isExplicit = false;
      const moderation = moderateContent(content || '', contentType, content);
      if (!moderation.allowed) {
        // Increment block count
        const newBlockCount = await storage.incrementSessionBlockCount(sessionId);
        
        // Check if should be silenced
        if (newBlockCount >= BLOCKS_BEFORE_SILENCE) {
          const silencedUntil = new Date();
          silencedUntil.setHours(silencedUntil.getHours() + SILENCE_DURATION_HOURS);
          
          // If already silenced before, expel until session expires
          if (session.silencedUntil) {
            await storage.updateCommunitySession(sessionId, {
              expelledUntil: session.expiresAt
            });
            return res.status(403).json({
              message: "expelled",
              expelledUntil: session.expiresAt
            });
          }
          
          await storage.updateCommunitySession(sessionId, { silencedUntil });
          return res.status(403).json({
            message: "silenced",
            silencedUntil,
            reason: "blocked_content_repeated"
          });
        }

        return res.status(400).json({ 
          message: "content_blocked",
          details: "This message contains information that is not allowed in this channel"
        });
      }
      isExplicit = moderation.isExplicit;

      // Create message with 24h expiration
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const message = await storage.createCommunityMessage({
        sessionId,
        zoneId: session.zoneId,
        contentType,
        content: contentType === 'text' ? content : (content || ''), // Asegurar que no sea null
        fileUrl: contentType !== 'text' ? content : undefined,
        duration: contentType === 'audio' ? duration : undefined,
        expiresAt,
      });

      // Update message with explicit flag if needed
      if (isExplicit) {
        // We need to update the message with isExplicit flag
        // For now, we'll create it with the flag
      }

      // Increment message count
      await storage.incrementSessionMessageCount(sessionId);

      res.json({ 
        success: true,
        messageId: message.id,
        remainingMessages: MAX_MESSAGES_PER_24H - session.messageCount - 1
      });
    } catch (error) {
      console.error("Send community message error:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Get session info
  app.get("/api/community/session/:sessionId", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { sessionId } = req.params;

      const session = await storage.getCommunitySession(sessionId);
      if (!session || session.userId !== user.id) {
        return res.status(404).json({ message: "Session not found" });
      }

      const zone = await storage.getCommunityZone(session.zoneId);

      res.json({
        sessionId: session.id,
        zoneId: session.zoneId,
        zoneName: zone?.name,
        pseudonym: session.pseudonym,
        messageCount: session.messageCount,
        silencedUntil: session.silencedUntil,
        expelledUntil: session.expelledUntil,
        expiresAt: session.expiresAt,
        isUnder16: session.age < 16,
      });
    } catch (error) {
      console.error("Get session error:", error);
      res.status(500).json({ message: "Failed to get session info" });
    }
  });

  // Leave community zone
  app.post("/api/community/leave", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { sessionId } = req.body;

      const session = await storage.getCommunitySession(sessionId);
      if (!session || session.userId !== user.id) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Mark session as expired
      await storage.updateCommunitySession(sessionId, { 
        expiresAt: new Date() 
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Leave community error:", error);
      res.status(500).json({ message: "Failed to leave community" });
    }
  });

  // Cleanup expired content (should be called periodically)
  app.post("/api/community/cleanup", async (_req, res) => {
    try {
      await storage.cleanupExpiredMessages();
      await storage.cleanupExpiredSessions();
      res.json({ success: true });
    } catch (error) {
      console.error("Cleanup error:", error);
      res.status(500).json({ message: "Cleanup failed" });
    }
  });

  // Get available zones (for admin/debugging)
  app.get("/api/community/zones", requireAuth, async (_req, res) => {
    try {
      const zones = await storage.getCommunityZones();
      res.json({ zones });
    } catch (error) {
      console.error("Get zones error:", error);
      res.status(500).json({ message: "Failed to get zones" });
    }
  });

  // Admin zone schema
  const adminZoneSchema = z.object({
    name: z.string().min(1).max(100),
    centerLat: z.number().min(-90).max(90),
    centerLng: z.number().min(-180).max(180),
    radiusMeters: z.number().min(50).max(500).default(100),
    zoneType: z.enum(['neighborhood', 'supermarket', 'park', 'school', 'university', 'other']).default('neighborhood'),
  });

  // Helper to check if user is the main admin (KlkCEO)
  const isMainAdmin = (user: User) => user.username === 'KlkCEO' || user.isAdmin;

  // Admin: Get all zones
  app.get("/api/admin/zones", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (!isMainAdmin(user)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const zones = await storage.getCommunityZones();
      res.json(zones);
    } catch (error) {
      console.error("Admin get zones error:", error);
      res.status(500).json({ message: "Failed to get zones" });
    }
  });

  // Admin: Create zone
  app.post("/api/admin/zones", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (!isMainAdmin(user)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const validatedData = adminZoneSchema.parse(req.body);
      const zone = await storage.createCommunityZone(validatedData);
      res.json(zone);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid zone data", errors: error.errors });
      }
      console.error("Admin create zone error:", error);
      res.status(500).json({ message: "Failed to create zone" });
    }
  });

  // Admin: Delete zone
  app.delete("/api/admin/zones/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (!isMainAdmin(user)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const zoneId = req.params.id;
      if (!zoneId || typeof zoneId !== 'string') {
        return res.status(400).json({ message: "Invalid zone ID" });
      }

      await storage.deleteCommunityZone(zoneId);
      res.json({ success: true });
    } catch (error) {
      console.error("Admin delete zone error:", error);
      res.status(500).json({ message: "Failed to delete zone" });
    }
  });

  // Update user age verification
  app.post("/api/auth/verify-age", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { age } = req.body;

      if (!age || age < 13 || age > 120) {
        return res.status(400).json({ message: "Invalid age" });
      }

      await storage.updateUser(user.id, { ageVerified: age });
      res.json({ success: true, ageVerified: age });
    } catch (error) {
      console.error("Age verification error:", error);
      res.status(500).json({ message: "Failed to verify age" });
    }
  });

  return httpServer;
}
