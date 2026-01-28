/**
 * SQLite to PostgreSQL Migration Script
 *
 * This script migrates data from a SQLite database to PostgreSQL.
 * It preserves UUIDs and maintains foreign key relationships.
 *
 * Usage:
 *   npx tsx scripts/migrate-sqlite-to-postgres.ts [--dry-run]
 *
 * Prerequisites:
 *   1. SQLite database file exists at packages/api/prisma/dev.db
 *   2. PostgreSQL is running and accessible
 *   3. PostgreSQL schema has been applied (prisma db push)
 *
 * Environment variables:
 *   SQLITE_URL - SQLite connection string (default: file:./packages/api/prisma/dev.db)
 *   DATABASE_URL - PostgreSQL connection string (required)
 */

import { PrismaClient as SQLiteClient } from '@prisma/client';
import { PrismaClient as PostgresClient } from '@prisma/client';

// Table migration order (respects foreign key dependencies)
const MIGRATION_ORDER = [
  'users',
  'workerProfiles',
  'walletLinks',
  'siweNonces',
  'userStats',
  'badgeDefinitions',
  'userBadges',
  'apiTokens',
  'taskTemplates',
  'tasks',
  'taskClaims',
  'submissions',
  'artefacts',
  'decisions',
  'disputes',
  'disputeAuditLogs',
  'escrows',
  'ledgerEntries',
  'chainEvents',
  'chainCursors',
  'webhooks',
  'webhookDeliveries',
  'auditEvents',
  'reputationEvents',
  'notifications',
  'feeConfigs',
] as const;

type TableName = (typeof MIGRATION_ORDER)[number];

interface MigrationStats {
  table: string;
  sourceCount: number;
  migratedCount: number;
  errors: string[];
}

// Parse JSON fields that were stored as strings in SQLite
function parseJsonField(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

// Convert SQLite record to PostgreSQL format
function convertRecord(tableName: string, record: Record<string, unknown>): Record<string, unknown> {
  const converted = { ...record };

  // JSON fields that need parsing (SQLite stores as string, PostgreSQL as JSONB)
  const jsonFields: Record<string, string[]> = {
    users: ['notificationPrefs', 'uiSettings', 'defaultRightsJson', 'savedAddresses'],
    workerProfiles: ['skills', 'kit'],
    userBadges: ['metadata'],
    badgeDefinitions: ['tiers'],
    apiTokens: ['scopes'],
    taskTemplates: ['schemaJson'],
    tasks: ['requirementsJson', 'policyJson', 'policyFlags'],
    submissions: ['proofBundleJson', 'verificationJson', 'flagsJson'],
    artefacts: ['exifJson'],
    ledgerEntries: ['metadata'],
    chainEvents: ['eventData'],
    webhooks: ['eventTypes'],
    auditEvents: ['detailsJson'],
    disputeAuditLogs: ['detailsJson'],
    reputationEvents: ['metadata'],
    notifications: ['data'],
  };

  const fieldsToConvert = jsonFields[tableName] || [];

  for (const field of fieldsToConvert) {
    if (field in converted) {
      converted[field] = parseJsonField(converted[field]);
    }
  }

  return converted;
}

// Map Prisma model names to table access
function getTableAccessor(client: SQLiteClient | PostgresClient, tableName: TableName) {
  const accessors: Record<TableName, () => unknown> = {
    users: () => client.user,
    workerProfiles: () => client.workerProfile,
    walletLinks: () => client.walletLink,
    siweNonces: () => client.siweNonce,
    userStats: () => client.userStats,
    badgeDefinitions: () => client.badgeDefinition,
    userBadges: () => client.userBadge,
    apiTokens: () => client.apiToken,
    taskTemplates: () => client.taskTemplate,
    tasks: () => client.task,
    taskClaims: () => client.taskClaim,
    submissions: () => client.submission,
    artefacts: () => client.artefact,
    decisions: () => client.decision,
    disputes: () => client.dispute,
    disputeAuditLogs: () => client.disputeAuditLog,
    escrows: () => client.escrow,
    ledgerEntries: () => client.ledgerEntry,
    chainEvents: () => client.chainEvent,
    chainCursors: () => client.chainCursor,
    webhooks: () => client.webhook,
    webhookDeliveries: () => client.webhookDelivery,
    auditEvents: () => client.auditEvent,
    reputationEvents: () => client.reputationEvent,
    notifications: () => client.notification,
    feeConfigs: () => client.feeConfig,
  };

  return accessors[tableName]();
}

async function migrateTable(
  sqlite: SQLiteClient,
  postgres: PostgresClient,
  tableName: TableName,
  dryRun: boolean
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    table: tableName,
    sourceCount: 0,
    migratedCount: 0,
    errors: [],
  };

  try {
    // Get source data
    const sourceTable = getTableAccessor(sqlite, tableName) as { findMany: () => Promise<unknown[]> };
    const records = await sourceTable.findMany();
    stats.sourceCount = records.length;

    if (records.length === 0) {
      console.log(`  ${tableName}: No records to migrate`);
      return stats;
    }

    console.log(`  ${tableName}: Migrating ${records.length} records...`);

    if (dryRun) {
      stats.migratedCount = records.length;
      return stats;
    }

    // Insert into PostgreSQL
    const targetTable = getTableAccessor(postgres, tableName) as {
      createMany: (args: { data: unknown[]; skipDuplicates: boolean }) => Promise<{ count: number }>;
    };

    // Convert records
    const convertedRecords = (records as Record<string, unknown>[]).map((record) =>
      convertRecord(tableName, record)
    );

    // Use createMany for bulk insert
    const result = await targetTable.createMany({
      data: convertedRecords,
      skipDuplicates: true,
    });

    stats.migratedCount = result.count;
    console.log(`  ${tableName}: Migrated ${result.count}/${records.length} records`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    stats.errors.push(errorMsg);
    console.error(`  ${tableName}: ERROR - ${errorMsg}`);
  }

  return stats;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('SQLite to PostgreSQL Migration');
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('\n*** DRY RUN MODE - No changes will be made ***\n');
  }

  // Validate environment
  const sqliteUrl = process.env.SQLITE_URL || 'file:./packages/api/prisma/dev.db';
  const postgresUrl = process.env.DATABASE_URL;

  if (!postgresUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  if (!postgresUrl.startsWith('postgresql://')) {
    console.error('ERROR: DATABASE_URL must be a PostgreSQL connection string');
    process.exit(1);
  }

  console.log(`Source (SQLite): ${sqliteUrl}`);
  console.log(`Target (PostgreSQL): ${postgresUrl.replace(/\/\/.*@/, '//***@')}`);
  console.log('');

  // Create clients
  // Note: In a real implementation, you'd need separate Prisma clients
  // generated for SQLite and PostgreSQL. This is a simplified version.
  const sqlite = new SQLiteClient({
    datasources: {
      db: { url: sqliteUrl },
    },
  });

  const postgres = new PostgresClient({
    datasources: {
      db: { url: postgresUrl },
    },
  });

  try {
    // Test connections
    console.log('Testing connections...');
    await sqlite.$connect();
    console.log('  SQLite: Connected');

    await postgres.$connect();
    console.log('  PostgreSQL: Connected');

    // Clear PostgreSQL tables (in reverse order)
    if (!dryRun) {
      console.log('\nClearing PostgreSQL tables...');
      for (const table of [...MIGRATION_ORDER].reverse()) {
        try {
          const targetTable = getTableAccessor(postgres, table) as {
            deleteMany: () => Promise<{ count: number }>;
          };
          const result = await targetTable.deleteMany();
          console.log(`  ${table}: Deleted ${result.count} records`);
        } catch {
          // Table might not exist yet, which is fine
        }
      }
    }

    // Migrate tables
    console.log('\nMigrating data...');
    const stats: MigrationStats[] = [];

    for (const table of MIGRATION_ORDER) {
      const tableStat = await migrateTable(sqlite, postgres, table, dryRun);
      stats.push(tableStat);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));

    let totalSource = 0;
    let totalMigrated = 0;
    let totalErrors = 0;

    for (const stat of stats) {
      totalSource += stat.sourceCount;
      totalMigrated += stat.migratedCount;
      totalErrors += stat.errors.length;

      if (stat.sourceCount > 0 || stat.errors.length > 0) {
        const status = stat.errors.length > 0 ? 'ERROR' : 'OK';
        console.log(`${stat.table.padEnd(20)} ${stat.migratedCount}/${stat.sourceCount} [${status}]`);
      }
    }

    console.log('-'.repeat(60));
    console.log(`Total: ${totalMigrated}/${totalSource} records migrated`);

    if (totalErrors > 0) {
      console.log(`\nErrors: ${totalErrors}`);
      for (const stat of stats) {
        for (const error of stat.errors) {
          console.log(`  - ${stat.table}: ${error}`);
        }
      }
    }

    // Verify migration
    if (!dryRun && totalErrors === 0) {
      console.log('\nVerifying migration...');

      // Check critical tables
      const criticalTables: TableName[] = ['users', 'tasks', 'submissions', 'escrows'];

      for (const table of criticalTables) {
        const sourceTable = getTableAccessor(sqlite, table) as { count: () => Promise<number> };
        const targetTable = getTableAccessor(postgres, table) as { count: () => Promise<number> };

        const sourceCount = await sourceTable.count();
        const targetCount = await targetTable.count();

        if (sourceCount !== targetCount) {
          console.error(`  ${table}: COUNT MISMATCH - Source: ${sourceCount}, Target: ${targetCount}`);
        } else {
          console.log(`  ${table}: Verified (${targetCount} records)`);
        }
      }
    }

    console.log('\n' + (dryRun ? 'Dry run complete!' : 'Migration complete!'));
  } catch (error) {
    console.error('\nMigration failed:', error);
    process.exit(1);
  } finally {
    await sqlite.$disconnect();
    await postgres.$disconnect();
  }
}

main();
