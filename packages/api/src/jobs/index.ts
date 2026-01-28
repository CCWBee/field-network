/**
 * Background Jobs Index
 *
 * This file registers all job workers and schedules repeating jobs.
 * Import and call initializeJobs() to start all workers.
 */

import { registerClaimExpiryWorker, scheduleClaimExpiryJob } from './claim-expiry';

/**
 * Initialize all job workers and schedulers
 * Call this when starting the worker process
 */
export async function initializeJobs(): Promise<void> {
  console.log('Initializing background jobs...');

  // Register workers
  registerClaimExpiryWorker();

  // Schedule repeating jobs
  await scheduleClaimExpiryJob();

  console.log('Background jobs initialized');
}

// Re-export individual job functions for manual triggering
export { runClaimExpiryNow } from './claim-expiry';
