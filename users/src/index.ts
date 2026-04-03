import expressApp from "./app.js";
import { initDB } from "./database/database.js";
import { register } from './metrics.js';

expressApp.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

expressApp.get('/', (_req, res) => {
  res.send('Users Service (TypeScript) is running!');
});

await initDB();

expressApp.listen(3000, () => {
  console.log("Users running on port 3000");
});
