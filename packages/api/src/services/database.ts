import { PrismaClient } from '@prisma/client';

/**
 * Database connection configuration with connection pooling
 *
 * Environment variables:
 * - DATABASE_URL: Connection string (PostgreSQL for prod, SQLite for test)
 * - NODE_ENV: Determines logging level and connection reuse
 *
 * Connection pooling (via DATABASE_URL query params):
 * - connection_limit: Max connections (default: 10)
 * - pool_timeout: Wait time for connection (default: 30s)
 *
 * Example PostgreSQL URL with pooling:
 * postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=30
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Determine log levels based on environment
const getLogLevels = () => {
  switch (process.env.NODE_ENV) {
    case 'test':
      // Minimal logging for tests
      return ['error'] as const;
    case 'development':
      // Verbose logging for development
      return ['query', 'info', 'warn', 'error'] as const;
    default:
      // Production: errors only
      return ['error'] as const;
  }
};

// Create the Prisma client with appropriate configuration
const createPrismaClient = () => {
  return new PrismaClient({
    log: [...getLogLevels()],
    // Note: Connection pooling is configured via DATABASE_URL query params
    // e.g., ?connection_limit=10&pool_timeout=30
  });
};

// Use existing client in development/test to prevent connection exhaustion
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Prevent multiple instances during hot reload (development only)
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Check database connectivity
 * @returns true if database is reachable, false otherwise
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    // Run a simple query to verify connection
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
}

/**
 * Get database connection info for health checks
 */
export async function getDatabaseStatus(): Promise<{
  connected: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - startTime;

    return {
      connected: true,
      latencyMs,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

/**
 * Gracefully disconnect from database
 * Call this on application shutdown
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
