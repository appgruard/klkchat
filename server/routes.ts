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
    "mailto:example@yourdomain.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
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

  app.patch("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { displayName, email, avatarUrl } = req.body;

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

      if (avatarUrl !== undefined) {
        updates.avatarUrl = avatarUrl || null;
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
    return transporter.sendMail({
      ...options,
      attachments: [
        ...(options.attachments || []),
        {
          filename: 'logo.png',
          path: path.resolve(process.cwd(), 'uploads/app-logo.png'),
          cid: 'app-logo'
        }
      ]
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

  // User routes
  app.use("/uploads", express.static(uploadDir));

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

  return httpServer;
}
