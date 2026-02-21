import express from 'express';
import cors from 'cors';
import { authRoutes } from './routes/auth.routes.js';

export const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);

app.listen(PORT, () => {
    console.log(`Auth Service running on port ${PORT}`);
});
