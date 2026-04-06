/**
 * Structured Logging with Pino
 *
 * Provides structured JSON logging with:
 * - Log levels: error, warn, info, debug
 * - Request ID tracking
 * - Pretty printing in development
 * - JSON output in production
 * - Child loggers with context
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

/**
 * Base logger configuration
 */
const baseConfig: pino.LoggerOptions = {
  level: logLevel,
  // Add base properties to all log messages
  base: {
    service: 'field-network-api',
    env: process.env.NODE_ENV || 'development',
  },
  // Custom timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,
  // Redact sensitive fields
  redact: {
    paths: [
      'password',
      'authorization',
      'cookie',
      'privateKey',
      'secret',
      'token',
      '*.password',
      '*.privateKey',
      '*.secret',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
};

/**
 * Transport configuration
 * - Development: Pretty print to console
 * - Production: JSON to stdout
 */
const transport = isProduction
  ? undefined
  : pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname,service,env',
      },
    });

/**
 * Create the base logger instance
 */
export const logger = pino(baseConfig, transport);

/**
 * Create a child logger with request context
 */
export function createRequestLogger(requestId: string, userId?: string) {
  return logger.child({
    requestId,
    ...(userId && { userId }),
  });
}

/**
 * Log levels:
 * - error: System errors that need immediate attention
 * - warn: Unexpected but handled situations
 * - info: Notable events (startup, shutdown, important actions)
 * - debug: Detailed information for debugging
 */

// Export convenience methods that match common usage patterns
export const log = {
  /**
   * Log an error with optional error object
   */
  error: (message: string, error?: Error | unknown, context?: object) => {
    if (error instanceof Error) {
      logger.error({ err: error, ...context }, message);
    } else if (error) {
      logger.error({ error, ...context }, message);
    } else {
      logger.error(context || {}, message);
    }
  },

  /**
   * Log a warning
   */
  warn: (message: string, context?: object) => {
    logger.warn(context || {}, message);
  },

  /**
   * Log informational message
   */
  info: (message: string, context?: object) => {
    logger.info(context || {}, message);
  },

  /**
   * Log debug information
   */
  debug: (message: string, context?: object) => {
    logger.debug(context || {}, message);
  },
};

export default logger;
