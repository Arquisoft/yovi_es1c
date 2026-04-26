import expressApp from "./app.js";
import { initDB } from "./database/database.js";
import { register } from './metrics.js';
import { UserRepository } from './repositories/users.repository.js';
import { ChatRepository } from './repositories/chat.repository.js';
import { UsersService } from './services/users.service.js';
import { UsersController } from './controllers/users.controller.js';
import { createUsersRouter } from './routes/users.routes.js';
import { ChatController } from './controllers/chat.controller.js';
import { createChatRouter } from './routes/chat.routes.js';

const db = await initDB();

const userRepository = new UserRepository(db);
const chatRepository = new ChatRepository(db, userRepository);
const usersService = new UsersService();
const usersController = new UsersController(usersService, userRepository);
const chatController = new ChatController(chatRepository);

expressApp.use('/api/users', createUsersRouter(usersController));
expressApp.use('/api/users/chat', createChatRouter(chatController));

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
