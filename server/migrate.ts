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
        age_verified INTEGER,
        is_admin BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Add age_verified and is_admin columns if they don't exist
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS age_verified INTEGER
    `);
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false
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
        description TEXT,
        center_lat DOUBLE PRECISION NOT NULL,
        center_lng DOUBLE PRECISION NOT NULL,
        radius_meters INTEGER NOT NULL DEFAULT 100,
        zone_type TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS community_sessions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        zone_id VARCHAR NOT NULL REFERENCES community_zones(id) ON DELETE CASCADE,
        pseudonym TEXT NOT NULL,
        age INTEGER NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0,
        block_count INTEGER NOT NULL DEFAULT 0,
        silenced_until TIMESTAMP,
        expelled_until TIMESTAMP,
        last_location_check TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS community_messages (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id VARCHAR NOT NULL REFERENCES community_sessions(id) ON DELETE CASCADE,
        zone_id VARCHAR NOT NULL REFERENCES community_zones(id) ON DELETE CASCADE,
        content_type TEXT NOT NULL,
        content TEXT,
        file_url TEXT,
        duration INTEGER,
        is_explicit BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_community_messages_zone ON community_messages(zone_id)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_community_messages_expires ON community_messages(expires_at)
    `);

    // Add missing columns to community tables if they were created with old schema
    await db.execute(sql`
      ALTER TABLE community_zones ADD COLUMN IF NOT EXISTS description TEXT
    `);
    await db.execute(sql`
      ALTER TABLE community_zones ADD COLUMN IF NOT EXISTS zone_type TEXT DEFAULT 'neighborhood'
    `);
    await db.execute(sql`
      ALTER TABLE community_zones ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true
    `);
    
    // Rename columns if needed (handle old schema)
    try {
      await db.execute(sql`ALTER TABLE community_zones RENAME COLUMN latitude TO center_lat`);
    } catch (e) { /* Column may already be named correctly */ }
    try {
      await db.execute(sql`ALTER TABLE community_zones RENAME COLUMN longitude TO center_lng`);
    } catch (e) { /* Column may already be named correctly */ }
    try {
      await db.execute(sql`ALTER TABLE community_zones RENAME COLUMN radius TO radius_meters`);
    } catch (e) { /* Column may already be named correctly */ }

    // Add missing columns to community_sessions
    await db.execute(sql`
      ALTER TABLE community_sessions ADD COLUMN IF NOT EXISTS age INTEGER DEFAULT 18
    `);
    await db.execute(sql`
      ALTER TABLE community_sessions ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0
    `);
    await db.execute(sql`
      ALTER TABLE community_sessions ADD COLUMN IF NOT EXISTS block_count INTEGER DEFAULT 0
    `);
    await db.execute(sql`
      ALTER TABLE community_sessions ADD COLUMN IF NOT EXISTS silenced_until TIMESTAMP
    `);
    await db.execute(sql`
      ALTER TABLE community_sessions ADD COLUMN IF NOT EXISTS expelled_until TIMESTAMP
    `);
    await db.execute(sql`
      ALTER TABLE community_sessions ADD COLUMN IF NOT EXISTS last_location_check TIMESTAMP DEFAULT NOW()
    `);
    await db.execute(sql`
      ALTER TABLE community_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '24 hours'
    `);

    // Add missing columns to community_messages
    await db.execute(sql`
      ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'text'
    `);
    await db.execute(sql`
      ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS content TEXT
    `);

    console.log("Database schema sync completed successfully");
  } catch (error) {
    console.error("Error syncing database schema:", error);
    throw error;
  }
}
