import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function tableExists(db: Database, tableName: string): Promise<boolean> {
  const row = await db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName],
  );
  return Boolean(row);
}

async function columnExists(db: Database, tableName: string, columnName: string): Promise<boolean> {
  const columns = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
}

async function migrateLegacyProfilesTable(db: Database): Promise<void> {
  const hasProfilesTable = await tableExists(db, "user_profiles");
  if (!hasProfilesTable) return;

  const hasUserIdColumn = await columnExists(db, "user_profiles", "user_id");
  if (hasUserIdColumn) return;

  await db.exec(`
    PRAGMA foreign_keys = OFF;

    DROP TABLE IF EXISTS chat_messages;
    DROP TABLE IF EXISTS chat_conversations;
    DROP TABLE IF EXISTS friend_requests;

    ALTER TABLE user_profiles RENAME TO user_profiles_legacy;

    CREATE TABLE user_profiles (
      user_id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT,
      email TEXT,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO user_profiles (user_id, username, avatar, created_at)
    SELECT id, username, avatar, created_at
    FROM user_profiles_legacy;

    DROP TABLE user_profiles_legacy;

    PRAGMA foreign_keys = ON;
  `);
}

export async function initDB(): Promise<Database> {
  const dataDir = process.env.DB_DATA_DIR || "/app/data";
  fs.mkdirSync(dataDir, { recursive: true });

  try {
    fs.accessSync(dataDir, fs.constants.W_OK);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Data directory is not writable: ${dataDir}. ${detail}`);
  }

  const dbPath = path.join(dataDir, "users.db");

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await db.exec("PRAGMA foreign_keys = ON");

  const schemaPath = path.join(__dirname, "users.sql");

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at ${schemaPath}`);
  }

  await migrateLegacyProfilesTable(db);

  const schema = fs.readFileSync(schemaPath, "utf-8");
  await db.exec(schema);

  console.log(`Database initialized at ${dbPath}`);
  return db;
}
