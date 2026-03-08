import express from "express";
import cors from "cors";
import { initDB } from "./database/database.js";

const app = express();
app.use(cors());
app.use(express.json());

await initDB();

export default app;

app.listen(3000, () => {
  console.log("Users running on port 3000");
});