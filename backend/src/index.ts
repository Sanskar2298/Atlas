import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { repoRoutes } from './routes/repoRoutes';
import { aiRoutes } from './routes/aiRoutes';
import { githubRoutes } from './routes/githubRoutes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { ensureDataDirectories } from './config/storage';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 5001;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/repos', repoRoutes);
app.use('/api', aiRoutes);
app.use('/api', githubRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Error Handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Bootstrap ───────────────────────────────────────────────────────────────
async function bootstrap() {
  await ensureDataDirectories();
  app.listen(PORT, () => {
    logger.info(`Atlas backend running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
