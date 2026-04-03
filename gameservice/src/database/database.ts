import * as sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import * as fs from "fs";
import * as path from "path";

export async function initDB(): Promise<Database> { //async function to initialize the database, create tables if they don't exist, and return the database instance
  const dbPath = process.env.GAME_DB_PATH || path.resolve("/app/data/game.db");
  
  // Create the directory for the database if it doesn't exist
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const schemaPath = "/app/dist/database/game.sql";
  
  // Check if the schema file exists
  if (!fs.existsSync(schemaPath)) {
    console.error(`Schema file not found at: ${schemaPath}`);
    console.error(`Available files in /app/dist/database/:`);
    const dbDir = "/app/dist/database";
    if (fs.existsSync(dbDir)) {
      const files = fs.readdirSync(dbDir);
      console.error(files);
    }
    throw new Error(`Schema file not found at ${schemaPath}`);
  }

  const schema = fs.readFileSync(schemaPath, "utf-8"); //read the SQL schema as text
  await db.exec(schema); //execute the instructions in the schema

  // If the database already existed before we added the 'mode' column, it won't have it.
  // So we check the current columns and add it manually if it's missing.
  const columns = await db.all("PRAGMA table_info(matches)");
  const hasMode = columns.some((col: { name: string }) => col.name === 'mode');
  if (!hasMode) {
    await db.run("ALTER TABLE matches ADD COLUMN mode TEXT DEFAULT 'BOT'");
  }

  console.log(`Database initialized at ${dbPath}`);
  return db;
}