import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, primaryKey, unique, integer, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - supports both registered and anonymous users
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name"),
  email: text("email"),
  emailVerified: boolean("email_verified").default(false).notNull(),
  avatarUrl: text("avatar_url"),
  isAnonymous: boolean("is_anonymous").default(false).notNull(),
  isOnline: boolean("is_online").default(false).notNull(),
  lastSeen: timestamp("last_seen").defaultNow(),
  publicKey: text("public_key"),
  ageVerified: integer("age_verified"), // null = not verified, number = verified age
  isAdmin: boolean("is_admin").default(false).notNull(),
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
  replyToId: varchar("reply_to_id"),
  encryptedContent: text("encrypted_content").notNull(),
  iv: text("iv").notNull(),
  status: text("status").default("sent").notNull(), // 'sent', 'delivered', 'read'
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  fileType: text("file_type"), // 'image', 'video', 'document', 'audio'
  fileSize: text("file_size"),
  duration: integer("duration"), // For audio/video in seconds
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

// Custom stickers table
export const customStickers = pgTable("custom_stickers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Hidden conversations (locked with PIN)
export const hiddenConversations = pgTable("hidden_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  pinHash: text("pin_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueHidden: unique("unique_user_conversation_hidden").on(table.userId, table.conversationId),
}));

// ==================== COMMUNITY MODULE ====================

// Community zones - geographic areas where community chats are available
export const communityZones = pgTable("community_zones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  centerLat: doublePrecision("center_lat").notNull(),
  centerLng: doublePrecision("center_lng").notNull(),
  radiusMeters: integer("radius_meters").notNull().default(100),
  zoneType: text("zone_type").notNull(), // 'neighborhood', 'supermarket', 'park', 'school', 'university', 'other'
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Community sessions - ephemeral user sessions in community zones
export const communitySessions = pgTable("community_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  zoneId: varchar("zone_id").notNull().references(() => communityZones.id, { onDelete: "cascade" }),
  pseudonym: text("pseudonym").notNull(), // Anonymous identity
  avatarSeed: text("avatar_seed").notNull(), // Avatar seed
  age: integer("age").notNull(),
  messageCount: integer("message_count").default(0).notNull(),
  blockCount: integer("block_count").default(0).notNull(),
  silencedUntil: timestamp("silenced_until"),
  expelledUntil: timestamp("expelled_until"),
  lastLocationCheck: timestamp("last_location_check").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // 24 hours from creation
});

// Community messages - ephemeral messages in community zones
export const communityMessages = pgTable("community_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => communitySessions.id, { onDelete: "cascade" }),
  zoneId: varchar("zone_id").notNull().references(() => communityZones.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(), // 'text', 'audio', 'sticker', 'gif'
  content: text("content"), // Text content or sticker/gif URL
  fileUrl: text("file_url"), // For audio files
  duration: integer("duration"), // Audio duration in seconds (max 30)
  isExplicit: boolean("is_explicit").default(false).notNull(), // Flag for explicit content
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // 24 hours from creation
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sentMessages: many(messages),
  conversationParticipants: many(conversationParticipants),
  recoveryCodes: many(recoveryCodes),
  blockedUsers: many(blockedUsers, { relationName: "blocker" }),
  blockedBy: many(blockedUsers, { relationName: "blocked" }),
  pushSubscriptions: many(pushSubscriptions),
  customStickers: many(customStickers),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));

export const customStickersRelations = relations(customStickers, ({ one }) => ({
  user: one(users, {
    fields: [customStickers.userId],
    references: [users.id],
  }),
}));

export const hiddenConversationsRelations = relations(hiddenConversations, ({ one }) => ({
  user: one(users, {
    fields: [hiddenConversations.userId],
    references: [users.id],
  }),
  conversation: one(conversations, {
    fields: [hiddenConversations.conversationId],
    references: [conversations.id],
  }),
}));

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
});

export const insertCustomStickerSchema = createInsertSchema(customStickers).omit({
  id: true,
  createdAt: true,
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;

export type CustomSticker = typeof customStickers.$inferSelect;
export type InsertCustomSticker = z.infer<typeof insertCustomStickerSchema>;

export const insertHiddenConversationSchema = createInsertSchema(hiddenConversations).omit({
  id: true,
  createdAt: true,
});

export type HiddenConversation = typeof hiddenConversations.$inferSelect;
export type InsertHiddenConversation = z.infer<typeof insertHiddenConversationSchema>;

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

// Community module relations
export const communityZonesRelations = relations(communityZones, ({ many }) => ({
  sessions: many(communitySessions),
  messages: many(communityMessages),
}));

export const communitySessionsRelations = relations(communitySessions, ({ one, many }) => ({
  user: one(users, {
    fields: [communitySessions.userId],
    references: [users.id],
  }),
  zone: one(communityZones, {
    fields: [communitySessions.zoneId],
    references: [communityZones.id],
  }),
  messages: many(communityMessages),
}));

export const communityMessagesRelations = relations(communityMessages, ({ one }) => ({
  session: one(communitySessions, {
    fields: [communityMessages.sessionId],
    references: [communitySessions.id],
  }),
  zone: one(communityZones, {
    fields: [communityMessages.zoneId],
    references: [communityZones.id],
  }),
}));

// Schemas for insert operations
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  displayName: true,
  email: true,
  avatarUrl: true,
  isAnonymous: true,
  publicKey: true,
}).extend({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  password: z.string().min(6),
  displayName: z.string().min(1).max(50).optional(),
  email: z.string().email("validation.invalidEmail").optional().or(z.literal("")),
  avatarUrl: z.string().optional(),
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  conversationId: true,
  senderId: true,
  replyToId: true,
  encryptedContent: true,
  iv: true,
  fileUrl: true,
  fileName: true,
  fileType: true,
  fileSize: true,
  duration: true,
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
  replyTo?: Message & { sender: UserPublic };
};

// ==================== COMMUNITY MODULE SCHEMAS & TYPES ====================

export const insertCommunityZoneSchema = createInsertSchema(communityZones).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1).max(100),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusMeters: z.number().min(50).max(500).default(100),
  zoneType: z.enum(['neighborhood', 'supermarket', 'park', 'school', 'university', 'other']),
});

export const insertCommunitySessionSchema = createInsertSchema(communitySessions).omit({
  id: true,
  createdAt: true,
  messageCount: true,
  blockCount: true,
  silencedUntil: true,
  expelledUntil: true,
  lastLocationCheck: true,
}).extend({
  avatarSeed: z.string(),
  age: z.number().min(13).max(120),
});

export const insertCommunityMessageSchema = createInsertSchema(communityMessages).omit({
  id: true,
  createdAt: true,
  isExplicit: true,
}).extend({
  contentType: z.enum(['text', 'sticker', 'gif']),
  duration: z.number().max(30).optional(),
});

export type CommunityZone = typeof communityZones.$inferSelect;
export type InsertCommunityZone = z.infer<typeof insertCommunityZoneSchema>;
export type CommunitySession = typeof communitySessions.$inferSelect;
export type InsertCommunitySession = z.infer<typeof insertCommunitySessionSchema>;
export type CommunityMessage = typeof communityMessages.$inferSelect;
export type InsertCommunityMessage = z.infer<typeof insertCommunityMessageSchema>;

// Extended community types for frontend
export type CommunityMessageWithSession = CommunityMessage & {
  session: {
    pseudonym: string;
  };
};
