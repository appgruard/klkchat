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

const SALT_ROUNDS = 12;

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

  // Update profile
  app.patch("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { displayName } = req.body;

      if (!displayName || typeof displayName !== "string") {
        return res.status(400).json({ message: "Invalid display name" });
      }

      const trimmedName = displayName.trim();
      if (trimmedName.length === 0 || trimmedName.length > 50) {
        return res.status(400).json({ message: "Display name must be between 1 and 50 characters" });
      }

      const updatedUser = await storage.updateUser(user.id, { displayName: trimmedName });
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

  // User routes
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

  // Serve uploaded files
  app.use("/uploads", (req, res, next) => {
    // Basic security check to ensure user is authenticated to see files
    if (!req.isAuthenticated()) {
      return res.status(401).send("Unauthorized");
    }
    next();
  }, express.static(uploadDir));

  app.post("/api/conversations/:id/read", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      await storage.markMessagesAsRead(id, user.id);
      
      // Notify other participant via WS
      const conversation = await storage.getConversationWithParticipants(id, user.id);
      if (conversation) {
        const otherParticipant = conversation.participants.find(p => p.id !== user.id);
        if (otherParticipant) {
          const ws = wsClients.get(otherParticipant.id);
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "read_receipt",
              payload: { conversationId: id, readerId: user.id }
            }));
          }
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error("Mark as read error:", error);
      res.status(500).json({ message: "Failed to mark messages as read" });
    }
  });

  // Push subscription routes
  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { endpoint, keys } = req.body;

      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "Invalid subscription" });
      }

      await storage.addPushSubscription({
        userId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      });

      res.status(201).json({ message: "Subscribed to push notifications" });
    } catch (error) {
      console.error("Push subscribe error:", error);
      res.status(500).json({ message: "Failed to subscribe" });
    }
  });

  // Message routes
  app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;

      const conversation = await storage.getConversationWithParticipants(id, user.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const isParticipant = conversation.participants.some((p) => p.id === user.id);
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

  app.post("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;
      const { content } = req.body;

      if (!content || typeof content !== "string") {
        return res.status(400).json({ message: "Message content is required" });
      }

      const conversationId = id as string;
      const conversation = await storage.getConversationWithParticipants(conversationId, user.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const isParticipant = conversation.participants.some((p) => p.id === user.id);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if either user has blocked the other
      const otherParticipant = conversation.participants.find((p) => p.id !== user.id);
      if (otherParticipant) {
        const iBlockedThem = await storage.isUserBlocked(user.id, otherParticipant.id);
        const theyBlockedMe = await storage.isUserBlocked(otherParticipant.id, user.id);
        if (iBlockedThem || theyBlockedMe) {
          return res.status(403).json({ message: "Cannot send messages to this user" });
        }
      }

      // For simplicity, we'll store the content directly
      // In a full E2EE implementation, this would be encrypted client-side
      const message = await storage.createMessage({
        conversationId: conversationId,
        senderId: user.id,
        encryptedContent: content,
        iv: randomBytes(12).toString("base64"),
        fileUrl: req.body.fileUrl,
        fileName: req.body.fileName,
        fileType: req.body.fileType,
        fileSize: req.body.fileSize,
        duration: req.body.duration,
      });

      // Notify other participants via WebSocket
      const otherParticipants = conversation.participants.filter((p) => p.id !== user.id);
      const messageWithSender = {
        ...message,
        sender: sanitizeUser(user as User),
      };

      for (const participant of otherParticipants) {
        const ws = wsClients.get(participant.id);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "message",
              payload: messageWithSender,
            })
          );
        }
      }

      res.json(messageWithSender);
    } catch (error) {
      console.error("Send message error:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Clear chat messages
  app.delete("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id } = req.params;

      const conversation = await storage.getConversationWithParticipants(id as string, user.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const isParticipant = conversation.participants.some((p) => p.id === user.id);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.clearMessagesForConversation(id as string);
      res.json({ message: "Chat cleared successfully" });
    } catch (error) {
      console.error("Clear chat error:", error);
      res.status(500).json({ message: "Failed to clear chat" });
    }
  });

  // Block user
  app.post("/api/users/:id/block", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id: blockedId } = req.params;

      if (blockedId === user.id) {
        return res.status(400).json({ message: "Cannot block yourself" });
      }

      const targetUser = await storage.getUser(blockedId as string);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.blockUser(user.id, blockedId as string);
      res.json({ message: "User blocked successfully" });
    } catch (error) {
      console.error("Block user error:", error);
      res.status(500).json({ message: "Failed to block user" });
    }
  });

  // Unblock user
  app.delete("/api/users/:id/block", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id: blockedId } = req.params;

      await storage.unblockUser(user.id, blockedId as string);
      res.json({ message: "User unblocked successfully" });
    } catch (error) {
      console.error("Unblock user error:", error);
      res.status(500).json({ message: "Failed to unblock user" });
    }
  });

  // Check if user is blocked
  app.get("/api/users/:id/blocked", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      const { id: targetId } = req.params;

      const isBlocked = await storage.isUserBlocked(user.id, targetId as string);
      res.json({ blocked: isBlocked });
    } catch (error) {
      console.error("Check blocked error:", error);
      res.status(500).json({ message: "Failed to check blocked status" });
    }
  });

  // WebSocket setup
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      ws.close(1008, "User ID required");
      return;
    }

    // Store the connection
    wsClients.set(userId, ws);
    await storage.setUserOnline(userId, true);

    // Notify other users that this user is online
    broadcastUserStatus(userId, true);

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === "typing") {
          // Broadcast typing indicator to conversation participants
          const { conversationId } = message.payload;
          const conversation = await storage.getConversationWithParticipants(
            conversationId,
            userId
          );
          
          if (conversation) {
            const otherParticipants = conversation.participants.filter(
              (p) => p.id !== userId
            );
            
            for (const participant of otherParticipants) {
              const targetWs = wsClients.get(participant.id);
              if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(
                  JSON.stringify({
                    type: "typing",
                    payload: { conversationId, userId },
                  })
                );
              }
            }
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", async () => {
      wsClients.delete(userId);
      await storage.setUserOnline(userId, false);
      broadcastUserStatus(userId, false);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  function broadcastUserStatus(userId: string, isOnline: boolean) {
    const statusMessage = JSON.stringify({
      type: isOnline ? "online" : "offline",
      payload: { userId },
    });

    wsClients.forEach((client, clientId) => {
      if (clientId !== userId && client.readyState === WebSocket.OPEN) {
        client.send(statusMessage);
      }
    });
  }

  return httpServer;
}
