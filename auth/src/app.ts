import express from 'express';
import helmet from 'helmet';
import { authRoutes } from './routes/auth.routes.js';
import { errorHandler } from './middleware/error-handler.js';
import { metricsRegistry } from './metrics.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json());

app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
});

app.use('/api/auth', authRoutes);
app.use(errorHandler);