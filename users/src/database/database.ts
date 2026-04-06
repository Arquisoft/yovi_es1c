import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  const dbAlreadyExists = fs.existsSync(dbPath);

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const schemaPath = path.join(__dirname, "users.sql");

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at ${schemaPath}`);
  }

  const schema = fs.readFileSync(schemaPath, "utf-8");
  if (!dbAlreadyExists) {
    await db.exec(schema);
  }

  console.log(`Database initialized at ${dbPath}`);
  return db;
}