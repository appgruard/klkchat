import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - supports both registered and anonymous users
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name"),
  isAnonymous: boolean("is_anonymous").default(false).notNull(),
  isOnline: boolean("is_online").default(false).notNull(),
  lastSeen: timestamp("last_seen").defaultNow(),
  publicKey: text("public_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Conversations table - one-to-one chats between two users
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Conversation participants - links users to conversations
export const conversationParticipants = pgTable("conversation_participants", {
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.conversationId, table.userId] }),
}));

// Messages table
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  encryptedContent: text("encrypted_content").notNull(),
  iv: text("iv").notNull(),
  status: text("status").default("sent").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Recovery codes for password recovery without email
export const recoveryCodes = pgTable("recovery_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  used: boolean("used").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Sessions table for session management
export const sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: text("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sentMessages: many(messages),
  conversationParticipants: many(conversationParticipants),
  recoveryCodes: many(recoveryCodes),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  participants: many(conversationParticipants),
  messages: many(messages),
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationParticipants.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [conversationParticipants.userId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}));

export const recoveryCodesRelations = relations(recoveryCodes, ({ one }) => ({
  user: one(users, {
    fields: [recoveryCodes.userId],
    references: [users.id],
  }),
}));

// Schemas for insert operations
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  displayName: true,
  isAnonymous: true,
  publicKey: true,
}).extend({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  password: z.string().min(6),
  displayName: z.string().min(1).max(50).optional(),
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  conversationId: true,
  senderId: true,
  encryptedContent: true,
  iv: true,
});

export const insertConversationSchema = createInsertSchema(conversations);

export const insertRecoveryCodeSchema = createInsertSchema(recoveryCodes).pick({
  userId: true,
  code: true,
  expiresAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type RecoveryCode = typeof recoveryCodes.$inferSelect;
export type InsertRecoveryCode = z.infer<typeof insertRecoveryCodeSchema>;

// Extended types for frontend use
export type UserPublic = Omit<User, "password">;
export type ConversationWithParticipants = Conversation & {
  participants: UserPublic[];
  lastMessage?: Message;
  unreadCount?: number;
};
export type MessageWithSender = Message & {
  sender: UserPublic;
};
