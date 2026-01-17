import type { Express, Request, Response, NextFunction } from "express";
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

const SALT_ROUNDS = 12;

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
      secret: process.env.SESSION_SECRET || "four-one-solutions-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
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

  // User routes
  app.get("/api/users/search/:query", requireAuth, async (req, res) => {
    try {
      const { query } = req.params;
      if (query.length < 2) {
        return res.json([]);
      }
      const users = await storage.searchUsers(query);
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

      const conversation = await storage.getConversationWithParticipants(id, user.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const isParticipant = conversation.participants.some((p) => p.id === user.id);
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
      }

      // For simplicity, we'll store the content directly
      // In a full E2EE implementation, this would be encrypted client-side
      const message = await storage.createMessage({
        conversationId: id,
        senderId: user.id,
        encryptedContent: content,
        iv: randomBytes(12).toString("base64"),
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
