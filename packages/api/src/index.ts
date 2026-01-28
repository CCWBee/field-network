import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

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
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { startChainIndexer } from './services/chainIndexer';
import { disconnectDatabase } from './services/database';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
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
app.use('/v1/fees', feeRoutes);
app.use('/v1/notifications', notificationRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const server = app.listen(PORT, () => {
  console.log(`Field Network API running on port ${PORT}`);

  // Start chain indexer if on-chain escrow is enabled
  if (process.env.ESCROW_PROVIDER === 'onchain' && process.env.ESCROW_CONTRACT_ADDRESS) {
    const chainId = process.env.CHAIN_ID === '8453' ? 8453 : 84532;
    startChainIndexer({
      chainId,
      contractAddress: process.env.ESCROW_CONTRACT_ADDRESS,
      rpcUrl: process.env.BASE_RPC_URL,
    });
    console.log(`Chain indexer started for chain ${chainId}`);
  }
});

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  server.close(async () => {
    console.log('HTTP server closed');

    try {
      await disconnectDatabase();
      console.log('Database connection closed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
