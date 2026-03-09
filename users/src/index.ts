import express from 'express';
import expressApp from "./app.js";
import { initDB } from "./database/database.js";

const app = express();
app.disable('x-powered-by');
const port = 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Users Service (TypeScript) is running!');
});

await initDB();


expressApp.listen(port, () => {
  console.log(`Users Service listening on port ${port}`);
});