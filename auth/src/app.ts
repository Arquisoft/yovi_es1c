import express from 'express';
import helmet from 'helmet';
import { authRoutes } from './routes/auth.routes.js';
import { errorHandler } from './middleware/error-handler.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use(errorHandler);