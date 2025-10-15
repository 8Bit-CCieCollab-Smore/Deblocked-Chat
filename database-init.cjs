// database-init.cjs
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import fs from "fs";

const DB_PATH = path.resolve("./chat.db");

async function initDatabase() {
  // Ensure database file exists
  if (!fs.existsSync(DB_PATH)) {
    console.log("🆕 Creating new SQLite database...");
  }

  // Open database connection
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  console.log("📀 Connected to SQLite database at", DB_PATH);

  // --- USERS TABLE ---
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      avatarUrl TEXT,
      joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // --- MESSAGES TABLE ---
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      username TEXT,
      content TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id)
    );
  `);

  // --- ONLINE STATUS CACHE (optional, not persisted) ---
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      active BOOLEAN DEFAULT 1,
      lastSeen DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // --- PROFILE PICTURES TABLE ---
  await db.exec(`
    CREATE TABLE IF NOT EXISTS avatars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      url TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Indexing for faster lookups
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_username ON messages(username);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `);

  console.log("✅ Database initialized and ready!");
  return db;
}

export default initDatabase;
