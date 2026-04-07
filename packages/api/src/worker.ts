import 'dotenv/config';
import { log } from './lib/logger';
import { initializeJobs } from './jobs';
import { closeQueues } from './lib/queue';
import { disconnectDatabase } from './services/database';

/**
 * Background Worker Process
 *
 * This is the entry point for the background job worker.
 * It runs separately from the API server and processes queued jobs.
 *
 * Start with: npm run worker
 * Or in Docker: docker-compose up worker
 *
 * Environment variables:
 * - REDIS_URL: Redis connection string
 * - DATABASE_URL: PostgreSQL connection string
 */

async function main() {
  log.info('Starting Field Network background worker...', {
    environment: process.env.NODE_ENV || 'development',
    redisConfigured: !!process.env.REDIS_URL,
  });

  try {
    // Initialize all job workers and schedules
    await initializeJobs();

    log.info('Worker is running. Press Ctrl+C to stop.');

    // Keep the process running
    await new Promise(() => {});
  } catch (error) {
    log.error('Worker failed to start', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  log.info(`Received ${signal}. Shutting down gracefully...`);

  try {
    // Close all queues and workers
    await closeQueues();
    log.info('Job queues closed');

    // Disconnect from database
    await disconnectDatabase();
    log.info('Database disconnected');

    log.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    log.error('Error during shutdown', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)), { promise: String(promise) });
  shutdown('unhandledRejection');
});

// Start the worker
main();
