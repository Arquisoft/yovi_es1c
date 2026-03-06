import express from "express";
import cors from "cors";
import { initDB } from "./database/database";


const app = express();
app.use(cors());
app.use(express.json());

(async () => {
  const db = await initDB();

  app.listen(3000, () => {
    console.log("Users running on port 3000");
  });
})();