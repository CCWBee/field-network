import 'dotenv/config';
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
  console.log('Starting Field Network background worker...');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Redis URL: ${process.env.REDIS_URL ? 'configured' : 'using default'}`);

  try {
    // Initialize all job workers and schedules
    await initializeJobs();

    console.log('Worker is running. Press Ctrl+C to stop.');

    // Keep the process running
    await new Promise(() => {});
  } catch (error) {
    console.error('Worker failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  try {
    // Close all queues and workers
    await closeQueues();
    console.log('Job queues closed');

    // Disconnect from database
    await disconnectDatabase();
    console.log('Database disconnected');

    console.log('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  shutdown('unhandledRejection');
});

// Start the worker
main();
