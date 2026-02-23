import * as sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import * as fs from "fs";
import * as path from "path";

export async function initDB(): Promise<Database> {
  const dbPath = path.resolve(process.cwd(), "game.db");

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const schemaPath = path.resolve(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");

  await db.exec(schema);

  return db;
}