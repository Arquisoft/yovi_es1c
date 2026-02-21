import express from 'express';
import helmet from 'helmet';
import { authRoutes } from './routes/auth.routes.js';

export const app = express();
const PORT = process.env.PORT || 3001;

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json());

app.use('/api/auth', authRoutes);

app.listen(PORT, () => {
    console.log(`Auth Service running on port ${PORT}`);
});