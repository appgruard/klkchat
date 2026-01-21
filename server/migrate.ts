import { sql } from "drizzle-orm";
import { db, pool } from "./db";

export async function runMigrations() {
  console.log("Running database schema sync...");

  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        display_name TEXT,
        email TEXT,
        email_verified BOOLEAN NOT NULL DEFAULT false,
        avatar_url TEXT,
        is_anonymous BOOLEAN NOT NULL DEFAULT false,
        is_online BOOLEAN NOT NULL DEFAULT false,
        last_seen TIMESTAMP DEFAULT NOW(),
        public_key TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS conversations (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS conversation_participants (
        conversation_id VARCHAR NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (conversation_id, user_id)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id VARCHAR NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reply_to_id VARCHAR,
        encrypted_content TEXT NOT NULL,
        iv TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sent',
        file_url TEXT,
        file_name TEXT,
        file_type TEXT,
        file_size TEXT,
        duration INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id VARCHAR
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS recovery_codes (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        used BOOLEAN NOT NULL DEFAULT false,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR PRIMARY KEY,
        sess TEXT NOT NULL,
        expire TIMESTAMP NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire)
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS blocked_users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        blocker_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT unique_blocker_blocked UNIQUE(blocker_id, blocked_id)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS custom_stickers (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        name TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS hidden_conversations (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        conversation_id VARCHAR NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        pin_hash TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT unique_user_conversation_hidden UNIQUE(user_id, conversation_id)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS community_zones (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        radius INTEGER NOT NULL DEFAULT 100,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS community_sessions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        zone_id VARCHAR NOT NULL REFERENCES community_zones(id) ON DELETE CASCADE,
        pseudonym TEXT NOT NULL,
        avatar_seed TEXT NOT NULL,
        age_verified BOOLEAN NOT NULL DEFAULT false,
        is_under_16 BOOLEAN NOT NULL DEFAULT false,
        last_activity TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS community_messages (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        zone_id VARCHAR NOT NULL REFERENCES community_zones(id) ON DELETE CASCADE,
        session_id VARCHAR NOT NULL REFERENCES community_sessions(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        message_type TEXT NOT NULL DEFAULT 'text',
        file_url TEXT,
        duration INTEGER,
        is_explicit BOOLEAN NOT NULL DEFAULT false,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_community_messages_zone ON community_messages(zone_id)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_community_messages_expires ON community_messages(expires_at)
    `);

    console.log("Database schema sync completed successfully");
  } catch (error) {
    console.error("Error syncing database schema:", error);
    throw error;
  }
}
