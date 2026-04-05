import { initDB } from "./database.js";

async function main(): Promise<void> {
  const db = await initDB();
  await db.close();
  console.log("users.db initialized successfully.");
}

main().catch((err) => {
  console.error("Failed to initialize users.db:", err);
  process.exit(1);
});
