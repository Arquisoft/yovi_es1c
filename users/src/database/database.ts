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

  const dbPath = path.join(dataDir, "users.db");

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const schemaPath = path.join(__dirname, "users.sql");

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at ${schemaPath}`);
  }

  const schema = fs.readFileSync(schemaPath, "utf-8");
  await db.exec(schema);

  console.log(`Database initialized at ${dbPath}`);
  return db;
}