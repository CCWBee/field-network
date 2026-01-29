import 'dotenv/config';
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

import { logger } from './lib/logger';
import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import taskRoutes from './routes/tasks';
import claimRoutes from './routes/claims';
import submissionRoutes from './routes/submissions';
import webhookRoutes from './routes/webhooks';
import uploadRoutes from './routes/uploads';
import artefactRoutes from './routes/artefacts';
import storageRoutes from './routes/storage';
import disputeRoutes from './routes/disputes';
import adminRoutes from './routes/admin';
import marketplaceRoutes from './routes/marketplace';
import badgeRoutes from './routes/badges';
import statsRoutes from './routes/stats';
import feeRoutes from './routes/fees';
import notificationRoutes from './routes/notifications';
import healthRoutes from './routes/health';
import usersRoutes from './routes/users';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { startChainIndexer } from './services/chainIndexer';
import { disconnectDatabase } from './services/database';
import { startExpiryJobs, stopExpiryJobs } from './services/expiryJobs';

// Initialize Sentry for error tracking (must be done early)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Sample rate for error events (1.0 = 100%)
    sampleRate: 1.0,
    // Performance monitoring sample rate
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Don't send errors in development by default
    enabled: process.env.NODE_ENV === 'production',
    // Filter out sensitive data
    beforeSend(event) {
      // Remove any wallet addresses or private keys from error messages
      if (event.message) {
        event.message = event.message.replace(/0x[a-fA-F0-9]{40}/g, '[WALLET_ADDRESS]');
        event.message = event.message.replace(/0x[a-fA-F0-9]{64}/g, '[PRIVATE_KEY]');
      }
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },
  });
  logger.info('Sentry error tracking initialized');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Parse CORS origins (supports comma-separated list or single origin)
function parseCorsOrigins(): string | string[] {
  // Support both CORS_ORIGINS (preferred) and CORS_ORIGIN (legacy)
  const origins = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:3001';
  if (origins.includes(',')) {
    return origins.split(',').map(o => o.trim());
  }
  return origins;
}

// Security middleware
app.use(helmet());
app.use(cors({
  origin: parseCorsOrigins(),
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Health check routes (no rate limiting)
app.use('/health', healthRoutes);

// API routes (v1)
app.use('/v1/auth', authRoutes);
app.use('/v1/profile', profileRoutes);
app.use('/v1/tasks', taskRoutes);
app.use('/v1/claims', claimRoutes);
app.use('/v1/submissions', submissionRoutes);
app.use('/v1/webhooks', webhookRoutes);
app.use('/v1/uploads', uploadRoutes);
app.use('/v1/artefacts', artefactRoutes);
app.use('/v1/storage', storageRoutes);
app.use('/v1/disputes', disputeRoutes);
app.use('/v1', disputeRoutes); // For /v1/submissions/:id/dispute route
app.use('/v1/admin', adminRoutes);
app.use('/v1/marketplace', marketplaceRoutes);
app.use('/v1/badges', badgeRoutes);
app.use('/v1/users', statsRoutes);
app.use('/v1/users', usersRoutes); // Public profiles, reviews
app.use('/v1/fees', feeRoutes);
app.use('/v1/notifications', notificationRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Field Network API running');

  // Start expiry jobs (claim and task expiration checks)
  startExpiryJobs();

  // Start chain indexer if on-chain escrow is enabled
  if (process.env.ESCROW_PROVIDER === 'onchain' && process.env.ESCROW_CONTRACT_ADDRESS) {
    const chainId = process.env.CHAIN_ID === '8453' ? 8453 : 84532;
    startChainIndexer({
      chainId,
      contractAddress: process.env.ESCROW_CONTRACT_ADDRESS,
      rpcUrl: process.env.BASE_RPC_URL,
    });
    logger.info({ chainId }, 'Chain indexer started');
  }
});

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, shutting down gracefully');

  // Stop background jobs
  stopExpiryJobs();

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await disconnectDatabase();
      logger.info('Database connection closed');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
