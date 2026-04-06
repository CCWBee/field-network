#!/usr/bin/env npx ts-node
/**
 * Load Test Suite for Field Network
 *
 * Validates system performance under load:
 * - Concurrent user simulation
 * - Throughput measurement
 * - Latency percentiles (p50, p95, p99)
 * - Error rate under load
 *
 * Usage:
 *   npx ts-node scripts/load-test.ts                     # Default: 50 users, 60s
 *   npx ts-node scripts/load-test.ts --users=100         # 100 concurrent users
 *   npx ts-node scripts/load-test.ts --duration=120      # 120 second test
 *   npx ts-node scripts/load-test.ts --env=production    # Target production
 *
 * Requirements:
 *   - Node.js 18+ (for native fetch)
 *   - API must be running
 *
 * Exit codes:
 *   0 - Load test passed all thresholds
 *   1 - One or more thresholds exceeded
 *   2 - Configuration error
 */

// =============================================================================
// Configuration
// =============================================================================

const ENVIRONMENTS: Record<string, string> = {
  local: 'http://localhost:3000',
  staging: process.env.STAGING_API_URL || 'https://api-staging.field-network.com',
  production: process.env.PRODUCTION_API_URL || 'https://api.field-network.com',
};

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name: string, defaultValue: string): string => {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : defaultValue;
};

const envName = getArg('env', 'local');
const concurrentUsers = parseInt(getArg('users', '50'));
const durationSeconds = parseInt(getArg('duration', '60'));
const rampUpSeconds = parseInt(getArg('rampup', '10'));

const API_URL = ENVIRONMENTS[envName];
if (!API_URL) {
  console.error(`Unknown environment: ${envName}`);
  process.exit(2);
}

// Performance thresholds
const THRESHOLDS = {
  maxP99Latency: 1000, // 1 second
  maxP95Latency: 500,  // 500ms
  maxP50Latency: 200,  // 200ms
  maxErrorRate: 0.01,  // 1%
  minRps: 50,          // 50 requests per second
};

// =============================================================================
// Types
// =============================================================================

interface RequestResult {
  endpoint: string;
  method: string;
  statusCode: number;
  latency: number;
  error?: string;
  timestamp: number;
}

interface EndpointStats {
  endpoint: string;
  method: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  latencies: number[];
}

// =============================================================================
// Load Test Implementation
// =============================================================================

class LoadTest {
  private results: RequestResult[] = [];
  private running = false;
  private startTime = 0;
  private virtualUsers: Promise<void>[] = [];

  constructor(
    private apiUrl: string,
    private concurrentUsers: number,
    private durationMs: number,
    private rampUpMs: number
  ) {}

  async run(): Promise<void> {
    console.log('Starting load test...');
    console.log(`  Target: ${this.apiUrl}`);
    console.log(`  Users: ${this.concurrentUsers}`);
    console.log(`  Duration: ${this.durationMs / 1000}s`);
    console.log(`  Ramp-up: ${this.rampUpMs / 1000}s`);
    console.log('');

    this.running = true;
    this.startTime = Date.now();

    // Ramp up users gradually
    const userDelay = this.rampUpMs / this.concurrentUsers;

    for (let i = 0; i < this.concurrentUsers; i++) {
      this.virtualUsers.push(this.runVirtualUser(i));
      await this.sleep(userDelay);
    }

    // Wait for duration
    const remainingTime = this.durationMs - (Date.now() - this.startTime);
    if (remainingTime > 0) {
      await this.sleep(remainingTime);
    }

    // Stop all users
    this.running = false;

    // Wait for in-flight requests
    await Promise.all(this.virtualUsers);

    console.log('Load test complete. Analyzing results...\n');
  }

  private async runVirtualUser(userId: number): Promise<void> {
    while (this.running) {
      // Randomly select endpoint to hit
      const endpoint = this.getRandomEndpoint();
      await this.makeRequest(endpoint.method, endpoint.path);

      // Small delay between requests (simulates think time)
      await this.sleep(100 + Math.random() * 400);
    }
  }

  private getRandomEndpoint(): { method: string; path: string } {
    const endpoints = [
      { method: 'GET', path: '/health', weight: 5 },
      { method: 'GET', path: '/v1/tasks?limit=10', weight: 30 },
      { method: 'GET', path: '/v1/marketplace/tasks?limit=10', weight: 25 },
      { method: 'GET', path: '/v1/badges', weight: 10 },
      { method: 'GET', path: '/v1/tasks?status=posted&limit=5', weight: 20 },
      { method: 'GET', path: '/health', weight: 10 },
    ];

    // Weighted random selection
    const totalWeight = endpoints.reduce((sum, e) => sum + e.weight, 0);
    let random = Math.random() * totalWeight;

    for (const endpoint of endpoints) {
      random -= endpoint.weight;
      if (random <= 0) {
        return { method: endpoint.method, path: endpoint.path };
      }
    }

    return endpoints[0];
  }

  private async makeRequest(method: string, path: string): Promise<void> {
    const url = `${this.apiUrl}${path}`;
    const start = Date.now();

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const latency = Date.now() - start;

      this.results.push({
        endpoint: path,
        method,
        statusCode: response.status,
        latency,
        timestamp: start,
      });
    } catch (error) {
      const latency = Date.now() - start;
      this.results.push({
        endpoint: path,
        method,
        statusCode: 0,
        latency,
        error: error instanceof Error ? error.message : String(error),
        timestamp: start,
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getResults(): RequestResult[] {
    return this.results;
  }
}

// =============================================================================
// Statistics
// =============================================================================

function calculateStats(results: RequestResult[]): {
  overall: {
    totalRequests: number;
    successCount: number;
    errorCount: number;
    errorRate: number;
    rps: number;
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    mean: number;
  };
  byEndpoint: EndpointStats[];
} {
  if (results.length === 0) {
    throw new Error('No results to analyze');
  }

  // Calculate duration from first to last request
  const sortedByTime = [...results].sort((a, b) => a.timestamp - b.timestamp);
  const durationMs = sortedByTime[sortedByTime.length - 1].timestamp - sortedByTime[0].timestamp;
  const durationSeconds = durationMs / 1000;

  // Overall stats
  const successResults = results.filter((r) => r.statusCode >= 200 && r.statusCode < 400);
  const errorResults = results.filter((r) => r.statusCode < 200 || r.statusCode >= 400);

  const latencies = results.map((r) => r.latency).sort((a, b) => a - b);

  const overall = {
    totalRequests: results.length,
    successCount: successResults.length,
    errorCount: errorResults.length,
    errorRate: errorResults.length / results.length,
    rps: results.length / durationSeconds,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    min: Math.min(...latencies),
    max: Math.max(...latencies),
    mean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
  };

  // Stats by endpoint
  const byEndpointMap = new Map<string, EndpointStats>();

  for (const result of results) {
    const key = `${result.method} ${result.endpoint}`;
    let stats = byEndpointMap.get(key);

    if (!stats) {
      stats = {
        endpoint: result.endpoint,
        method: result.method,
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        latencies: [],
      };
      byEndpointMap.set(key, stats);
    }

    stats.totalRequests++;
    if (result.statusCode >= 200 && result.statusCode < 400) {
      stats.successCount++;
    } else {
      stats.errorCount++;
    }
    stats.latencies.push(result.latency);
  }

  return {
    overall,
    byEndpoint: Array.from(byEndpointMap.values()),
  };
}

function percentile(sortedArr: number[], p: number): number {
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, index)];
}

// =============================================================================
// Report
// =============================================================================

function printReport(stats: ReturnType<typeof calculateStats>): void {
  console.log('='.repeat(70));
  console.log('Load Test Results');
  console.log('='.repeat(70));
  console.log('');

  // Overall stats
  console.log('Overall Performance:');
  console.log('-'.repeat(70));
  console.log(`  Total Requests:     ${stats.overall.totalRequests}`);
  console.log(`  Successful:         ${stats.overall.successCount}`);
  console.log(`  Failed:             ${stats.overall.errorCount}`);
  console.log(`  Error Rate:         ${(stats.overall.errorRate * 100).toFixed(2)}%`);
  console.log(`  Requests/sec:       ${stats.overall.rps.toFixed(2)}`);
  console.log('');
  console.log('  Latency (ms):');
  console.log(`    Min:              ${stats.overall.min}`);
  console.log(`    Mean:             ${stats.overall.mean.toFixed(2)}`);
  console.log(`    P50:              ${stats.overall.p50}`);
  console.log(`    P95:              ${stats.overall.p95}`);
  console.log(`    P99:              ${stats.overall.p99}`);
  console.log(`    Max:              ${stats.overall.max}`);
  console.log('');

  // By endpoint
  console.log('Performance by Endpoint:');
  console.log('-'.repeat(70));
  console.log('');

  const sortedEndpoints = stats.byEndpoint.sort((a, b) => b.totalRequests - a.totalRequests);

  for (const endpoint of sortedEndpoints) {
    const sortedLatencies = endpoint.latencies.sort((a, b) => a - b);
    const p95 = percentile(sortedLatencies, 95);
    const errorRate = endpoint.errorCount / endpoint.totalRequests;

    console.log(`  ${endpoint.method} ${endpoint.endpoint}`);
    console.log(`    Requests: ${endpoint.totalRequests}, Errors: ${endpoint.errorCount} (${(errorRate * 100).toFixed(1)}%), P95: ${p95}ms`);
  }
  console.log('');
}

function checkThresholds(stats: ReturnType<typeof calculateStats>): boolean {
  console.log('Threshold Checks:');
  console.log('-'.repeat(70));

  let allPassed = true;

  // P99 latency
  const p99Passed = stats.overall.p99 <= THRESHOLDS.maxP99Latency;
  console.log(`  P99 Latency <= ${THRESHOLDS.maxP99Latency}ms: ${stats.overall.p99}ms ${p99Passed ? '[PASS]' : '[FAIL]'}`);
  allPassed = allPassed && p99Passed;

  // P95 latency
  const p95Passed = stats.overall.p95 <= THRESHOLDS.maxP95Latency;
  console.log(`  P95 Latency <= ${THRESHOLDS.maxP95Latency}ms: ${stats.overall.p95}ms ${p95Passed ? '[PASS]' : '[FAIL]'}`);
  allPassed = allPassed && p95Passed;

  // P50 latency
  const p50Passed = stats.overall.p50 <= THRESHOLDS.maxP50Latency;
  console.log(`  P50 Latency <= ${THRESHOLDS.maxP50Latency}ms: ${stats.overall.p50}ms ${p50Passed ? '[PASS]' : '[FAIL]'}`);
  allPassed = allPassed && p50Passed;

  // Error rate
  const errorRatePassed = stats.overall.errorRate <= THRESHOLDS.maxErrorRate;
  console.log(`  Error Rate <= ${THRESHOLDS.maxErrorRate * 100}%: ${(stats.overall.errorRate * 100).toFixed(2)}% ${errorRatePassed ? '[PASS]' : '[FAIL]'}`);
  allPassed = allPassed && errorRatePassed;

  // RPS
  const rpsPassed = stats.overall.rps >= THRESHOLDS.minRps;
  console.log(`  RPS >= ${THRESHOLDS.minRps}: ${stats.overall.rps.toFixed(2)} ${rpsPassed ? '[PASS]' : '[FAIL]'}`);
  allPassed = allPassed && rpsPassed;

  console.log('');

  return allPassed;
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  console.log('');
  console.log('='.repeat(70));
  console.log('Field Network Load Test');
  console.log('='.repeat(70));
  console.log('');

  // Check API is reachable
  try {
    const healthCheck = await fetch(`${API_URL}/health`);
    if (!healthCheck.ok) {
      console.error(`API health check failed: ${healthCheck.status}`);
      process.exit(2);
    }
  } catch (error) {
    console.error(`Cannot reach API at ${API_URL}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  // Run load test
  const loadTest = new LoadTest(
    API_URL,
    concurrentUsers,
    durationSeconds * 1000,
    rampUpSeconds * 1000
  );

  await loadTest.run();

  // Calculate and print results
  const results = loadTest.getResults();
  const stats = calculateStats(results);

  printReport(stats);

  const passed = checkThresholds(stats);

  if (passed) {
    console.log('='.repeat(70));
    console.log('LOAD TEST PASSED');
    console.log('='.repeat(70));
    process.exit(0);
  } else {
    console.log('='.repeat(70));
    console.log('LOAD TEST FAILED - Thresholds exceeded');
    console.log('='.repeat(70));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Load test failed:', error);
  process.exit(2);
});
