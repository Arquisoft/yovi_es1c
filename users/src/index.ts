import expressApp from "./app.js";
import { initDB } from "./database/database.js";
import { register } from './metrics.js';
import { UserRepository } from './repositories/users.repository.js';
import { UsersService } from './services/users.service.js';
import { UsersController } from './controllers/users.controller.js';
import { createUsersRouter } from './routes/users.routes.js';

const db = await initDB();

const userRepository = new UserRepository(db);
const usersService = new UsersService();
const usersController = new UsersController(usersService, userRepository);

expressApp.use('/api/users', createUsersRouter(usersController));

expressApp.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

expressApp.get('/', (_req, res) => {
  res.send('Users Service (TypeScript) is running!');
});

expressApp.listen(3000, () => {
  console.log("Users running on port 3000");
});
