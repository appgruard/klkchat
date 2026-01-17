import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, primaryKey, unique } from "drizzle-orm/pg-core";
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
  status: text("status").default("sent").notNull(), // 'sent', 'delivered', 'read'
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  fileType: text("file_type"), // 'image', 'video', 'document'
  fileSize: text("file_size"),
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

// Blocked users table
export const blockedUsers = pgTable("blocked_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blockerId: varchar("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedId: varchar("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueBlock: unique("unique_blocker_blocked").on(table.blockerId, table.blockedId),
}));

// Push subscriptions table
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sentMessages: many(messages),
  conversationParticipants: many(conversationParticipants),
  recoveryCodes: many(recoveryCodes),
  blockedUsers: many(blockedUsers, { relationName: "blocker" }),
  blockedBy: many(blockedUsers, { relationName: "blocked" }),
  pushSubscriptions: many(pushSubscriptions),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;

export const blockedUsersRelations = relations(blockedUsers, ({ one }) => ({
  blocker: one(users, {
    fields: [blockedUsers.blockerId],
    references: [users.id],
    relationName: "blocker",
  }),
  blocked: one(users, {
    fields: [blockedUsers.blockedId],
    references: [users.id],
    relationName: "blocked",
  }),
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
  fileUrl: true,
  fileName: true,
  fileType: true,
  fileSize: true,
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
export type BlockedUser = typeof blockedUsers.$inferSelect;

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
