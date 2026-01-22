import {
  users,
  conversations,
  conversationParticipants,
  messages,
  recoveryCodes,
  blockedUsers,
  pushSubscriptions,
  customStickers,
  hiddenConversations,
  communityZones,
  communitySessions,
  communityMessages,
  type User,
  type InsertUser,
  type Message,
  type InsertMessage,
  type Conversation,
  type ConversationParticipant,
  type RecoveryCode,
  type InsertRecoveryCode,
  type UserPublic,
  type ConversationWithParticipants,
  type MessageWithSender,
  type BlockedUser,
  type PushSubscription,
  type InsertPushSubscription,
  type CustomSticker,
  type InsertCustomSticker,
  type HiddenConversation,
  type InsertHiddenConversation,
  type CommunityZone,
  type InsertCommunityZone,
  type CommunitySession,
  type InsertCommunitySession,
  type CommunityMessage,
  type InsertCommunityMessage,
  type CommunityMessageWithSession,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, desc, sql, ne, ilike, lt, gte } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  searchUsers(query: string, userId: string, limit?: number): Promise<UserPublic[]>;
  setUserOnline(id: string, isOnline: boolean): Promise<void>;
  
  // Conversations
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationWithParticipants(id: string, userId: string): Promise<ConversationWithParticipants | undefined>;
  getConversationsForUser(userId: string): Promise<ConversationWithParticipants[]>;
  findExistingConversation(userId1: string, userId2: string): Promise<Conversation | undefined>;
  createConversation(participantIds: string[]): Promise<Conversation>;
  
  // Messages
  getMessage(id: string): Promise<Message | undefined>;
  getMessagesForConversation(conversationId: string, limit?: number): Promise<MessageWithSender[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessageStatus(id: string, status: string): Promise<void>;
  markMessagesAsRead(conversationId: string, userId: string): Promise<void>;
  
  // Recovery codes
  createRecoveryCode(code: InsertRecoveryCode): Promise<RecoveryCode>;
  getValidRecoveryCode(userId: string, code: string): Promise<RecoveryCode | undefined>;
  markRecoveryCodeUsed(id: string): Promise<void>;
  
  // Clear messages
  clearMessagesForConversation(conversationId: string): Promise<void>;
  
  // Blocked users
  blockUser(blockerId: string, blockedId: string): Promise<BlockedUser>;
  unblockUser(blockerId: string, blockedId: string): Promise<void>;
  isUserBlocked(blockerId: string, blockedId: string): Promise<boolean>;
  getBlockedUsers(userId: string): Promise<string[]>;
  getBlockedUsersDetailed(userId: string): Promise<UserPublic[]>;
  deleteUser(userId: string): Promise<void>;

  // Push Subscriptions
  addPushSubscription(subscription: InsertPushSubscription): Promise<PushSubscription>;
  getPushSubscriptions(userId: string): Promise<PushSubscription[]>;
  deletePushSubscription(endpoint: string): Promise<void>;
  getUserByEmail(email: string): Promise<User[]>;

  // Custom Stickers
  getCustomStickers(userId: string): Promise<CustomSticker[]>;
  addCustomSticker(sticker: InsertCustomSticker): Promise<CustomSticker>;
  deleteCustomSticker(stickerId: string, userId: string): Promise<void>;

  // Hidden Conversations
  getHiddenConversations(userId: string): Promise<HiddenConversation[]>;
  hideConversation(hidden: InsertHiddenConversation): Promise<HiddenConversation>;
  unhideConversation(conversationId: string, userId: string): Promise<void>;
  getHiddenConversation(conversationId: string, userId: string): Promise<HiddenConversation | undefined>;

  // Community Zones
  getCommunityZones(): Promise<CommunityZone[]>;
  getCommunityZone(id: string): Promise<CommunityZone | undefined>;
  findZoneByLocation(lat: number, lng: number): Promise<CommunityZone | undefined>;
  createCommunityZone(zone: InsertCommunityZone): Promise<CommunityZone>;
  updateCommunityZone(id: string, updates: Partial<CommunityZone>): Promise<CommunityZone | undefined>;
  deleteCommunityZone(id: string): Promise<void>;

  // Community Sessions
  getCommunitySession(id: string): Promise<CommunitySession | undefined>;
  getActiveSessionForUser(userId: string, zoneId: string): Promise<CommunitySession | undefined>;
  createCommunitySession(session: InsertCommunitySession): Promise<CommunitySession>;
  updateCommunitySession(id: string, updates: Partial<CommunitySession>): Promise<CommunitySession | undefined>;
  incrementSessionMessageCount(sessionId: string): Promise<void>;
  incrementSessionBlockCount(sessionId: string, reporterId: string): Promise<CommunitySession | null>;
  cleanupExpiredSessions(): Promise<void>;

  // Community Messages
  getCommunityMessages(zoneId: string, hideExplicit: boolean): Promise<CommunityMessageWithSession[]>;
  createCommunityMessage(message: InsertCommunityMessage): Promise<CommunityMessage>;
  deleteCommunityMessage(id: string): Promise<void>;
  cleanupExpiredMessages(): Promise<void>;
  getSessionMessageCountLast24h(sessionId: string): Promise<number>;
  getLastMessageTime(sessionId: string, contentType: string): Promise<Date | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // List of initial admins
    const initialAdmins = ["KlkCEO", "mysticFoxyy"];
    const isAdmin = initialAdmins.includes(insertUser.username);

    const [user] = await db.insert(users).values({
      ...insertUser,
      isAdmin: isAdmin || insertUser.isAdmin || false,
    }).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async searchUsers(query: string, userId: string, limit: number = 20): Promise<UserPublic[]> {
    const results = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        isAnonymous: users.isAnonymous,
        isOnline: users.isOnline,
        lastSeen: users.lastSeen,
        publicKey: users.publicKey,
        email: users.email,
        emailVerified: users.emailVerified,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
        ageVerified: users.ageVerified,
        isAdmin: users.isAdmin,
      })
      .from(users)
      .where(
        and(
          or(
            ilike(users.username, `%${query}%`),
            ilike(users.displayName, `%${query}%`)
          ),
          eq(users.isAnonymous, false),
          ne(users.id, userId)
        )
      )
      .limit(limit);
    return results;
  }

  async setUserOnline(id: string, isOnline: boolean): Promise<void> {
    await db
      .update(users)
      .set({ isOnline, lastSeen: new Date() })
      .where(eq(users.id, id));
  }

  // Conversations
  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    return conversation || undefined;
  }

  async getConversationWithParticipants(
    id: string,
    userId: string
  ): Promise<ConversationWithParticipants | undefined> {
    const conversation = await this.getConversation(id);
    if (!conversation) return undefined;

    const participants = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        isAnonymous: users.isAnonymous,
        isOnline: users.isOnline,
        lastSeen: users.lastSeen,
        publicKey: users.publicKey,
        email: users.email,
        emailVerified: users.emailVerified,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
        ageVerified: users.ageVerified,
        isAdmin: users.isAdmin,
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(conversationParticipants.userId, users.id))
      .where(eq(conversationParticipants.conversationId, id));

    const [lastMessage] = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(desc(messages.createdAt))
      .limit(1);

    const [unreadResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, id),
          ne(messages.senderId, userId),
          ne(messages.status, "read")
        )
      );

    return {
      ...conversation,
      participants,
      lastMessage: lastMessage || undefined,
      unreadCount: unreadResult?.count || 0,
    };
  }

  async getConversationsForUser(userId: string): Promise<ConversationWithParticipants[]> {
    const userConversations = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId));

    const conversationIds = userConversations.map((c) => c.conversationId);
    
    if (conversationIds.length === 0) return [];

    const result: ConversationWithParticipants[] = [];

    for (const convId of conversationIds) {
      const conv = await this.getConversationWithParticipants(convId, userId);
      // Only include conversations that have at least one message
      if (conv && conv.lastMessage) {
        result.push(conv);
      }
    }

    // Sort by last message or creation date
    result.sort((a, b) => {
      const dateA = a.lastMessage?.createdAt || a.createdAt;
      const dateB = b.lastMessage?.createdAt || b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return result;
  }

  async findExistingConversation(
    userId1: string,
    userId2: string
  ): Promise<Conversation | undefined> {
    const user1Convs = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId1));

    for (const { conversationId } of user1Convs) {
      const [hasUser2] = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.userId, userId2)
          )
        );

      if (hasUser2) {
        const conv = await this.getConversation(conversationId);
        if (conv) return conv;
      }
    }

    return undefined;
  }

  async createConversation(participantIds: string[]): Promise<Conversation> {
    const [conversation] = await db
      .insert(conversations)
      .values({})
      .returning();

    for (const participantId of participantIds) {
      await db.insert(conversationParticipants).values({
        conversationId: conversation.id,
        userId: participantId,
      });
    }

    return conversation;
  }

  // Messages
  async getMessage(id: string): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.id, id));
    return message || undefined;
  }

  async getMessagesForConversation(
    conversationId: string,
    limit: number = 100
  ): Promise<MessageWithSender[]> {
    const result = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        replyToId: messages.replyToId,
        encryptedContent: messages.encryptedContent,
        iv: messages.iv,
        status: messages.status,
        fileUrl: messages.fileUrl,
        fileName: messages.fileName,
        fileType: messages.fileType,
        fileSize: messages.fileSize,
        duration: messages.duration,
        createdAt: messages.createdAt,
        sender: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          isAnonymous: users.isAnonymous,
          isOnline: users.isOnline,
          lastSeen: users.lastSeen,
          publicKey: users.publicKey,
          email: users.email,
          emailVerified: users.emailVerified,
          avatarUrl: users.avatarUrl,
          createdAt: users.createdAt,
          ageVerified: users.ageVerified,
          isAdmin: users.isAdmin,
        },
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt)
      .limit(limit);

    return result;
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();

    // Update conversation's updatedAt
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, message.conversationId));

    return newMessage;
  }

  async updateMessageStatus(id: string, status: string): Promise<void> {
    await db.update(messages).set({ status }).where(eq(messages.id, id));
  }

  async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    await db
      .update(messages)
      .set({ status: "read" })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          ne(messages.senderId, userId),
          ne(messages.status, "read")
        )
      );
  }

  // Recovery codes
  async createRecoveryCode(code: InsertRecoveryCode): Promise<RecoveryCode> {
    const [recoveryCode] = await db
      .insert(recoveryCodes)
      .values(code)
      .returning();
    return recoveryCode;
  }

  async getValidRecoveryCode(
    userId: string,
    code: string
  ): Promise<RecoveryCode | undefined> {
    const [result] = await db
      .select()
      .from(recoveryCodes)
      .where(
        and(
          eq(recoveryCodes.userId, userId),
          eq(recoveryCodes.code, code),
          eq(recoveryCodes.used, false),
          sql`${recoveryCodes.expiresAt} > NOW()`
        )
      );
    return result || undefined;
  }

  async markRecoveryCodeUsed(id: string): Promise<void> {
    await db
      .update(recoveryCodes)
      .set({ used: true })
      .where(eq(recoveryCodes.id, id));
  }

  // Clear messages
  async clearMessagesForConversation(conversationId: string): Promise<void> {
    await db.delete(messages).where(eq(messages.conversationId, conversationId));
  }

  // Blocked users
  async blockUser(blockerId: string, blockedId: string): Promise<BlockedUser> {
    const existing = await this.isUserBlocked(blockerId, blockedId);
    if (existing) {
      const [blocked] = await db
        .select()
        .from(blockedUsers)
        .where(
          and(
            eq(blockedUsers.blockerId, blockerId),
            eq(blockedUsers.blockedId, blockedId)
          )
        );
      return blocked;
    }

    const [blocked] = await db
      .insert(blockedUsers)
      .values({ blockerId, blockedId })
      .returning();
    return blocked;
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    await db
      .delete(blockedUsers)
      .where(
        and(
          eq(blockedUsers.blockerId, blockerId),
          eq(blockedUsers.blockedId, blockedId)
        )
      );
  }

  async isUserBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const [result] = await db
      .select()
      .from(blockedUsers)
      .where(
        and(
          eq(blockedUsers.blockerId, blockerId),
          eq(blockedUsers.blockedId, blockedId)
        )
      );
    return !!result;
  }

  async getBlockedUsers(userId: string): Promise<string[]> {
    const blocked = await db
      .select({ blockedId: blockedUsers.blockedId })
      .from(blockedUsers)
      .where(eq(blockedUsers.blockerId, userId));
    return blocked.map((b) => b.blockedId);
  }

  async getBlockedUsersDetailed(userId: string): Promise<UserPublic[]> {
    const results = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        isAnonymous: users.isAnonymous,
        isOnline: users.isOnline,
        lastSeen: users.lastSeen,
        publicKey: users.publicKey,
        email: users.email,
        emailVerified: users.emailVerified,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
        ageVerified: users.ageVerified,
        isAdmin: users.isAdmin,
      })
      .from(blockedUsers)
      .innerJoin(users, eq(blockedUsers.blockedId, users.id))
      .where(eq(blockedUsers.blockerId, userId));
    
    console.log(`Fetching blocked users for ${userId} (Storage), found: ${results.length}`);
    return results;
  }

  async deleteUser(userId: string): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
  }

  // Push Subscriptions
  async addPushSubscription(subscription: InsertPushSubscription): Promise<PushSubscription> {
    const [result] = await db.insert(pushSubscriptions).values(subscription).returning();
    return result;
  }

  async getPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async getUserByEmail(email: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.email, email));
  }

  // Custom Stickers
  async getCustomStickers(userId: string): Promise<CustomSticker[]> {
    return db.select().from(customStickers).where(eq(customStickers.userId, userId)).orderBy(desc(customStickers.createdAt));
  }

  async addCustomSticker(sticker: InsertCustomSticker): Promise<CustomSticker> {
    const [result] = await db.insert(customStickers).values(sticker).returning();
    return result;
  }

  async deleteCustomSticker(stickerId: string, userId: string): Promise<void> {
    await db.delete(customStickers).where(and(eq(customStickers.id, stickerId), eq(customStickers.userId, userId)));
  }

  // Hidden Conversations
  async getHiddenConversations(userId: string): Promise<HiddenConversation[]> {
    return db.select().from(hiddenConversations).where(eq(hiddenConversations.userId, userId));
  }

  async hideConversation(hidden: InsertHiddenConversation): Promise<HiddenConversation> {
    const [result] = await db.insert(hiddenConversations).values(hidden).returning();
    return result;
  }

  async unhideConversation(conversationId: string, userId: string): Promise<void> {
    await db.delete(hiddenConversations).where(
      and(eq(hiddenConversations.conversationId, conversationId), eq(hiddenConversations.userId, userId))
    );
  }

  async getHiddenConversation(conversationId: string, userId: string): Promise<HiddenConversation | undefined> {
    const [result] = await db.select().from(hiddenConversations).where(
      and(eq(hiddenConversations.conversationId, conversationId), eq(hiddenConversations.userId, userId))
    );
    return result || undefined;
  }

  // ==================== COMMUNITY MODULE ====================

  // Community Zones
  async getCommunityZones(): Promise<CommunityZone[]> {
    return db.select().from(communityZones);
  }

  async getCommunityZone(id: string): Promise<CommunityZone | undefined> {
    const [zone] = await db.select().from(communityZones).where(eq(communityZones.id, id));
    return zone || undefined;
  }

  async findZoneByLocation(lat: number, lng: number): Promise<CommunityZone | undefined> {
    // Get all active zones and find one that contains the point
    const zones = await this.getCommunityZones();
    
    for (const zone of zones) {
      const distance = this.calculateDistance(lat, lng, zone.centerLat, zone.centerLng);
      // Add 10m tolerance to avoid false positives at boundary
      if (distance <= zone.radiusMeters + 10) {
        return zone;
      }
    }
    return undefined;
  }

  // Haversine formula to calculate distance between two points
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async createCommunityZone(zone: InsertCommunityZone): Promise<CommunityZone> {
    const [result] = await db.insert(communityZones).values(zone).returning();
    return result;
  }

  async updateCommunityZone(id: string, updates: Partial<CommunityZone>): Promise<CommunityZone | undefined> {
    const [result] = await db.update(communityZones).set(updates).where(eq(communityZones.id, id)).returning();
    return result || undefined;
  }

  async deleteCommunityZone(id: string): Promise<void> {
    await db.delete(communityZones).where(eq(communityZones.id, id));
  }

  // Community Sessions
  async getCommunitySession(id: string): Promise<CommunitySession | undefined> {
    const [session] = await db.select().from(communitySessions).where(
      and(eq(communitySessions.id, id), gte(communitySessions.expiresAt, new Date()))
    );
    return session || undefined;
  }

  async getActiveSessionForUser(userId: string, zoneId: string): Promise<CommunitySession | undefined> {
    const [session] = await db.select().from(communitySessions).where(
      and(
        eq(communitySessions.userId, userId),
        eq(communitySessions.zoneId, zoneId),
        gte(communitySessions.expiresAt, new Date())
      )
    );
    return session || undefined;
  }

  async createCommunitySession(session: InsertCommunitySession): Promise<CommunitySession> {
    const [result] = await db.insert(communitySessions).values(session).returning();
    return result;
  }

  async updateCommunitySession(id: string, updates: Partial<CommunitySession>): Promise<CommunitySession | undefined> {
    const [result] = await db.update(communitySessions).set(updates).where(eq(communitySessions.id, id)).returning();
    return result || undefined;
  }

  async incrementSessionMessageCount(sessionId: string): Promise<void> {
    await db.update(communitySessions)
      .set({ messageCount: sql`${communitySessions.messageCount} + 1` })
      .where(eq(communitySessions.id, sessionId));
  }

  async incrementSessionBlockCount(sessionId: string, reporterId: string): Promise<CommunitySession | null> {
    const [session] = await db.select().from(communitySessions).where(eq(communitySessions.id, sessionId));
    if (!session) return null;

    const alreadyBlocked = await this.isUserBlocked(reporterId, session.userId);
    if (alreadyBlocked) return null;

    await this.blockUser(reporterId, session.userId);

    const [updated] = await db
      .update(communitySessions)
      .set({ blockCount: sql`${communitySessions.blockCount} + 1` })
      .where(eq(communitySessions.id, sessionId))
      .returning();
    return updated || null;
  }

  async cleanupExpiredSessions(): Promise<void> {
    // Delete ALL community sessions to "empty" the chat
    await db.delete(communitySessions);
  }

  // Community Messages
  async getCommunityMessages(zoneId: string, hideExplicit: boolean): Promise<CommunityMessageWithSession[]> {
    const now = new Date();
    
    let query = db.select({
      id: communityMessages.id,
      sessionId: communityMessages.sessionId,
      zoneId: communityMessages.zoneId,
      contentType: communityMessages.contentType,
      content: communityMessages.content,
      fileUrl: communityMessages.fileUrl,
      duration: communityMessages.duration,
      isExplicit: communityMessages.isExplicit,
      createdAt: communityMessages.createdAt,
      expiresAt: communityMessages.expiresAt,
      session: {
        pseudonym: communitySessions.pseudonym,
      },
    })
    .from(communityMessages)
    .innerJoin(communitySessions, eq(communityMessages.sessionId, communitySessions.id))
    .where(
      and(
        eq(communityMessages.zoneId, zoneId),
        gte(communityMessages.expiresAt, now),
        hideExplicit ? eq(communityMessages.isExplicit, false) : sql`true`
      )
    )
    .orderBy(communityMessages.createdAt);

    return query;
  }

  async createCommunityMessage(message: InsertCommunityMessage): Promise<CommunityMessage> {
    const [result] = await db.insert(communityMessages).values(message).returning();
    return result;
  }

  async deleteCommunityMessage(id: string): Promise<void> {
    await db.delete(communityMessages).where(eq(communityMessages.id, id));
  }

  async cleanupExpiredMessages(): Promise<void> {
    // Delete ALL community messages to "empty" the chat
    await db.delete(communityMessages);
  }

  async getSessionMessageCountLast24h(sessionId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(communityMessages)
      .where(eq(communityMessages.sessionId, sessionId));
    return result?.count || 0;
  }

  async getLastMessageTime(sessionId: string, contentType: string): Promise<Date | undefined> {
    const [result] = await db.select({ createdAt: communityMessages.createdAt })
      .from(communityMessages)
      .where(
        and(
          eq(communityMessages.sessionId, sessionId),
          eq(communityMessages.contentType, contentType)
        )
      )
      .orderBy(desc(communityMessages.createdAt))
      .limit(1);
    return result?.createdAt || undefined;
  }
}

export const storage = new DatabaseStorage();
