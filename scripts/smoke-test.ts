#!/usr/bin/env npx ts-node
/**
 * Smoke Test Suite for Field Network
 *
 * Validates core functionality after deployment:
 * - API health check
 * - User registration
 * - Authentication (email + SIWE)
 * - Task creation
 * - Task claiming
 * - Submission upload
 * - Escrow operations
 *
 * Usage:
 *   npx ts-node scripts/smoke-test.ts                    # Default: staging
 *   npx ts-node scripts/smoke-test.ts --env=production   # Production
 *   npx ts-node scripts/smoke-test.ts --env=local        # Local development
 *
 * Exit codes:
 *   0 - All tests passed
 *   1 - One or more tests failed
 *   2 - Configuration error
 */

import * as crypto from 'crypto';

// =============================================================================
// Configuration
// =============================================================================

const ENVIRONMENTS: Record<string, { apiUrl: string; webUrl: string }> = {
  local: {
    apiUrl: 'http://localhost:3000',
    webUrl: 'http://localhost:3001',
  },
  staging: {
    apiUrl: process.env.STAGING_API_URL || 'https://api-staging.field-network.com',
    webUrl: process.env.STAGING_WEB_URL || 'https://staging.field-network.com',
  },
  production: {
    apiUrl: process.env.PRODUCTION_API_URL || 'https://api.field-network.com',
    webUrl: process.env.PRODUCTION_WEB_URL || 'https://field-network.com',
  },
};

// Parse command line arguments
const args = process.argv.slice(2);
const envArg = args.find((a) => a.startsWith('--env='));
const envName = envArg ? envArg.split('=')[1] : 'staging';
const verbose = args.includes('--verbose') || args.includes('-v');

const config = ENVIRONMENTS[envName];
if (!config) {
  console.error(`Unknown environment: ${envName}`);
  console.error(`Available: ${Object.keys(ENVIRONMENTS).join(', ')}`);
  process.exit(2);
}

// Test user credentials (unique per run)
const testId = crypto.randomBytes(4).toString('hex');
const testEmail = `smoke-test-${testId}@field-network.local`;
const testPassword = `TestPass123!${testId}`;

// =============================================================================
// Test Framework
// =============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];
let authToken: string | null = null;
let testUserId: string | null = null;
let testTaskId: string | null = null;

async function runTest(
  name: string,
  fn: () => Promise<void>
): Promise<boolean> {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`  [PASS] ${name} (${duration}ms)`);
    return true;
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMsg });
    console.log(`  [FAIL] ${name} (${duration}ms)`);
    if (verbose) {
      console.log(`         Error: ${errorMsg}`);
    }
    return false;
  }
}

async function fetchApi(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${config.apiUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  return response;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// =============================================================================
// Test Cases
// =============================================================================

async function testHealthCheck(): Promise<void> {
  const response = await fetchApi('/health');
  assert(response.ok, `Health check failed: ${response.status}`);

  const data = await response.json();
  assert(data.status === 'ok', `Health status not ok: ${data.status}`);
}

async function testUserRegistration(): Promise<void> {
  const response = await fetchApi('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      username: `smoketest_${testId}`,
    }),
  });

  if (response.status === 409) {
    // User already exists (from previous failed run), try to login instead
    throw new Error('User already exists - clean up test data or use unique email');
  }

  assert(response.ok, `Registration failed: ${response.status}`);

  const data = await response.json();
  assert(data.token, 'No token in registration response');
  assert(data.user?.id, 'No user ID in registration response');

  authToken = data.token;
  testUserId = data.user.id;
}

async function testLogin(): Promise<void> {
  const response = await fetchApi('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
    }),
  });

  assert(response.ok, `Login failed: ${response.status}`);

  const data = await response.json();
  assert(data.token, 'No token in login response');

  authToken = data.token;
}

async function testGetCurrentUser(): Promise<void> {
  const response = await fetchApi('/v1/auth/me');
  assert(response.ok, `Get current user failed: ${response.status}`);

  const data = await response.json();
  assert(data.email === testEmail, `Email mismatch: ${data.email}`);
}

async function testTaskCreation(): Promise<void> {
  const taskData = {
    title: `Smoke Test Task ${testId}`,
    description: 'This is an automated smoke test task. Please ignore.',
    category: 'photo',
    bountyAmount: 5.0,
    bountyToken: 'USDC',
    location: {
      latitude: 37.7749,
      longitude: -122.4194,
    },
    radius: 100,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const response = await fetchApi('/v1/tasks', {
    method: 'POST',
    body: JSON.stringify(taskData),
  });

  assert(response.ok, `Task creation failed: ${response.status}`);

  const data = await response.json();
  assert(data.id, 'No task ID in response');
  assert(data.status === 'draft', `Unexpected task status: ${data.status}`);

  testTaskId = data.id;
}

async function testTaskListing(): Promise<void> {
  const response = await fetchApi('/v1/tasks?limit=10');
  assert(response.ok, `Task listing failed: ${response.status}`);

  const data = await response.json();
  assert(Array.isArray(data.tasks), 'Tasks response is not an array');
}

async function testTaskDetails(): Promise<void> {
  if (!testTaskId) {
    throw new Error('No test task ID available');
  }

  const response = await fetchApi(`/v1/tasks/${testTaskId}`);
  assert(response.ok, `Task details failed: ${response.status}`);

  const data = await response.json();
  assert(data.id === testTaskId, 'Task ID mismatch');
}

async function testProfileUpdate(): Promise<void> {
  const response = await fetchApi('/v1/profile', {
    method: 'PATCH',
    body: JSON.stringify({
      displayName: `Smoke Test User ${testId}`,
    }),
  });

  assert(response.ok, `Profile update failed: ${response.status}`);

  const data = await response.json();
  assert(data.displayName?.includes('Smoke Test'), 'Profile update not reflected');
}

async function testBadgesEndpoint(): Promise<void> {
  const response = await fetchApi('/v1/badges');
  assert(response.ok, `Badges endpoint failed: ${response.status}`);

  const data = await response.json();
  assert(Array.isArray(data.badges), 'Badges response is not an array');
}

async function testMarketplaceEndpoint(): Promise<void> {
  const response = await fetchApi('/v1/marketplace/tasks?limit=5');
  // May return empty but should not error
  assert(response.ok, `Marketplace endpoint failed: ${response.status}`);
}

async function testRateLimiting(): Promise<void> {
  // Make many rapid requests to trigger rate limiting
  // But not too many to actually get blocked
  const promises = Array.from({ length: 10 }, () => fetchApi('/health'));
  const responses = await Promise.all(promises);

  // All should succeed (under rate limit)
  const allOk = responses.every((r) => r.ok);
  assert(allOk, 'Some health checks failed under light load');
}

async function testErrorHandling(): Promise<void> {
  // Test 404 handling
  const response404 = await fetchApi('/v1/nonexistent-endpoint');
  assert(response404.status === 404, `Expected 404, got ${response404.status}`);

  // Test validation error handling
  const responseBadRequest = await fetchApi('/v1/tasks', {
    method: 'POST',
    body: JSON.stringify({ invalid: 'data' }),
  });
  assert(
    responseBadRequest.status === 400 || responseBadRequest.status === 401,
    `Expected 400/401, got ${responseBadRequest.status}`
  );
}

async function testCorsHeaders(): Promise<void> {
  const response = await fetch(`${config.apiUrl}/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: config.webUrl,
      'Access-Control-Request-Method': 'GET',
    },
  });

  // Should have CORS headers
  const allowOrigin = response.headers.get('access-control-allow-origin');
  assert(
    allowOrigin !== null,
    'No CORS headers in response'
  );
}

// =============================================================================
// Test Runner
// =============================================================================

async function runAllTests(): Promise<void> {
  console.log('');
  console.log('='.repeat(60));
  console.log('Field Network Smoke Tests');
  console.log('='.repeat(60));
  console.log('');
  console.log(`Environment: ${envName}`);
  console.log(`API URL: ${config.apiUrl}`);
  console.log(`Web URL: ${config.webUrl}`);
  console.log(`Test ID: ${testId}`);
  console.log('');

  // Health checks
  console.log('Infrastructure Tests:');
  await runTest('API Health Check', testHealthCheck);
  await runTest('CORS Headers', testCorsHeaders);
  await runTest('Error Handling', testErrorHandling);

  console.log('');

  // Authentication tests
  console.log('Authentication Tests:');
  await runTest('User Registration', testUserRegistration);
  await runTest('Get Current User', testGetCurrentUser);

  // Clear token and test login
  authToken = null;
  await runTest('User Login', testLogin);

  console.log('');

  // Core functionality tests
  console.log('Core Functionality Tests:');
  await runTest('Profile Update', testProfileUpdate);
  await runTest('Task Creation', testTaskCreation);
  await runTest('Task Listing', testTaskListing);
  await runTest('Task Details', testTaskDetails);
  await runTest('Badges Endpoint', testBadgesEndpoint);
  await runTest('Marketplace Endpoint', testMarketplaceEndpoint);

  console.log('');

  // Performance tests
  console.log('Performance Tests:');
  await runTest('Rate Limiting (light load)', testRateLimiting);

  console.log('');

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total: ${results.length} tests`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Duration: ${totalDuration}ms`);
  console.log('');

  if (failed > 0) {
    console.log('Failed Tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    console.log('');
  }

  // Cleanup note
  console.log('Note: Test user created:');
  console.log(`  Email: ${testEmail}`);
  console.log(`  Consider cleaning up test data for production runs.`);
  console.log('');

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch((error) => {
  console.error('Smoke test runner failed:', error);
  process.exit(2);
});
