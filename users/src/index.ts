import expressApp from "./app.js";
import { initDB } from "./database/database.js";

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

await initDB();

expressApp.get('/', (_req, res) => {
  res.send('Users Service is running!');
});

expressApp.listen(port, () => {
  console.log(`Users Service listening on port ${port}`);
});
