import expressApp from "./app.js";
import { initDB } from "./database/database.js";
import { UserRepository } from "./repositories/users.repository.js";
import { UsersService } from "./services/users.service.js";
import { UsersController } from "./controllers/users.controller.js";
import { createUsersRouter } from "./routes/users.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { verifyJwtMiddleware } from "./middleware/verify-jwt.js";

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

const db = await initDB();

const userRepo = new UserRepository(db);
const usersService = new UsersService(userRepo);
const usersController = new UsersController(usersService);

expressApp.get('/', (_req, res) => {
  res.send('Users Service is running!');
});

expressApp.use('/api/users', verifyJwtMiddleware, createUsersRouter(usersController));
expressApp.use(errorHandler);

expressApp.listen(port, () => {
  console.log(`Users Service listening on port ${port}`);
});
