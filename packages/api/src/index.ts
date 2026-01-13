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
import disputeRoutes from './routes/disputes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { startChainIndexer } from './services/chainIndexer';

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes (v1)
app.use('/v1/auth', authRoutes);
app.use('/v1/profile', profileRoutes);
app.use('/v1/tasks', taskRoutes);
app.use('/v1/claims', claimRoutes);
app.use('/v1/submissions', submissionRoutes);
app.use('/v1/webhooks', webhookRoutes);
app.use('/v1/uploads', uploadRoutes);
app.use('/v1/disputes', disputeRoutes);
app.use('/v1', disputeRoutes); // For /v1/submissions/:id/dispute route

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
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

export default app;
