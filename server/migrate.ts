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

    console.log("Database schema sync completed successfully");
  } catch (error) {
    console.error("Error syncing database schema:", error);
    throw error;
  }
}
