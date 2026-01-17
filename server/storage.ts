import {
  users,
  conversations,
  conversationParticipants,
  messages,
  recoveryCodes,
  blockedUsers,
  pushSubscriptions,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, desc, sql, ne, ilike } from "drizzle-orm";

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

  // Push Subscriptions
  addPushSubscription(subscription: InsertPushSubscription): Promise<PushSubscription>;
  getPushSubscriptions(userId: string): Promise<PushSubscription[]>;
  deletePushSubscription(endpoint: string): Promise<void>;
  getUserByEmail(email: string): Promise<User[]>;
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
    const [user] = await db.insert(users).values(insertUser).returning();
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
          createdAt: users.createdAt,
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
}

export const storage = new DatabaseStorage();
