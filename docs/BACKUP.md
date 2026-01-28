# PostgreSQL Backup and Recovery Guide

This document describes the backup and recovery procedures for the Field Network database.

## Backup Strategy

### Overview

Field Network uses a multi-layer backup strategy:

1. **Continuous backups**: Point-in-time recovery (PITR) via WAL archiving
2. **Daily snapshots**: Full database dumps stored for 30 days
3. **Weekly archives**: Compressed backups stored for 90 days

### Backup Schedule

| Type | Frequency | Retention | Method |
|------|-----------|-----------|--------|
| WAL Archive | Continuous | 7 days | pg_receivewal |
| Daily Snapshot | Every 24h (02:00 UTC) | 30 days | pg_dump |
| Weekly Archive | Every Sunday | 90 days | pg_dump --compress |

## Local Development Backups

### Manual Backup

Create a backup of your local PostgreSQL database:

```bash
# Using docker-compose
docker-compose exec db pg_dump -U postgres fieldnetwork > backup_$(date +%Y%m%d_%H%M%S).sql

# Direct connection (if PostgreSQL is running locally)
pg_dump -U postgres -h localhost -d fieldnetwork > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore from Backup

```bash
# Using docker-compose
docker-compose exec -T db psql -U postgres fieldnetwork < backup_20240115_143000.sql

# Direct connection
psql -U postgres -h localhost -d fieldnetwork < backup_20240115_143000.sql
```

### Backup Script

A convenience script is provided at `scripts/backup-db.sh`:

```bash
#!/bin/bash
# scripts/backup-db.sh

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/fieldnetwork_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create backup
echo "Creating backup: ${BACKUP_FILE}"
docker-compose exec -T db pg_dump -U postgres fieldnetwork > "$BACKUP_FILE"

# Compress the backup
gzip "$BACKUP_FILE"
echo "Backup compressed: ${BACKUP_FILE}.gz"

# Remove backups older than 30 days
find "$BACKUP_DIR" -name "fieldnetwork_*.sql.gz" -mtime +30 -delete
echo "Cleaned up old backups"

# Verify the backup
gunzip -t "${BACKUP_FILE}.gz" && echo "Backup verified successfully"
```

## Production Backups

### Railway PostgreSQL

If using Railway for production, backups are handled automatically:

1. **Automatic daily backups**: Railway creates daily snapshots
2. **Point-in-time recovery**: Available for the last 7 days
3. **Manual snapshots**: Create via Railway dashboard

To create a manual backup:
```bash
railway run pg_dump $DATABASE_URL > production_backup.sql
```

### AWS RDS

If using AWS RDS:

1. **Automated backups**: Configure in RDS settings
   - Backup retention period: 7-35 days
   - Backup window: During low-traffic hours

2. **Manual snapshots**:
```bash
aws rds create-db-snapshot \
  --db-instance-identifier fieldnetwork-prod \
  --db-snapshot-identifier fieldnetwork-$(date +%Y%m%d)
```

3. **Export to S3**:
```bash
aws rds start-export-task \
  --export-task-identifier fieldnetwork-export-$(date +%Y%m%d) \
  --source-arn arn:aws:rds:region:account:snapshot:snapshot-name \
  --s3-bucket-name fieldnetwork-backups \
  --iam-role-arn arn:aws:iam::account:role/rds-export-role \
  --kms-key-id arn:aws:kms:region:account:key/key-id
```

### Self-Hosted PostgreSQL

For self-hosted PostgreSQL with continuous archiving:

1. **Enable WAL archiving** in `postgresql.conf`:
```ini
wal_level = replica
archive_mode = on
archive_command = 'cp %p /var/lib/postgresql/wal_archive/%f'
```

2. **Configure backup script** (cron):
```bash
# /etc/cron.d/fieldnetwork-backup
0 2 * * * postgres /opt/fieldnetwork/scripts/backup-db.sh >> /var/log/backup.log 2>&1
```

## Recovery Procedures

### Point-in-Time Recovery (PITR)

Restore to a specific point in time (requires WAL archiving):

```bash
# Stop PostgreSQL
systemctl stop postgresql

# Restore base backup
pg_restore -d fieldnetwork /backups/base_backup.tar

# Configure recovery
cat > $PGDATA/recovery.conf << EOF
restore_command = 'cp /var/lib/postgresql/wal_archive/%f %p'
recovery_target_time = '2024-01-15 14:30:00 UTC'
recovery_target_action = 'promote'
EOF

# Start PostgreSQL
systemctl start postgresql
```

### Full Database Restore

```bash
# Drop and recreate database
psql -U postgres -c "DROP DATABASE IF EXISTS fieldnetwork;"
psql -U postgres -c "CREATE DATABASE fieldnetwork;"

# Restore from backup
psql -U postgres -d fieldnetwork < backup.sql
```

### Verify Backup Integrity

After restoring, verify data integrity:

```sql
-- Check record counts
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL SELECT 'submissions', COUNT(*) FROM submissions
UNION ALL SELECT 'escrows', COUNT(*) FROM escrows;

-- Check for orphaned records
SELECT COUNT(*) FROM tasks WHERE requester_id NOT IN (SELECT id FROM users);
SELECT COUNT(*) FROM submissions WHERE task_id NOT IN (SELECT id FROM tasks);

-- Verify foreign key constraints
-- (Should return no rows if all constraints are valid)
SELECT conname, conrelid::regclass
FROM pg_constraint
WHERE confrelid = 0 AND contype = 'f';
```

## Monitoring

### Backup Health Checks

Add these checks to your monitoring system:

1. **Backup age**: Alert if latest backup is older than 25 hours
2. **Backup size**: Alert on significant size changes (>50% deviation)
3. **Restore test**: Monthly automated restore to test environment

### Backup Metrics

Track these metrics:

- `backup_last_success_timestamp` - When the last backup completed
- `backup_duration_seconds` - How long backups take
- `backup_size_bytes` - Size of backup files
- `backup_restore_test_success` - Whether restore tests pass

## Disaster Recovery

### Recovery Time Objective (RTO)

- Target: < 1 hour
- Maximum: 4 hours

### Recovery Point Objective (RPO)

- Target: < 1 hour (with WAL archiving)
- Maximum: 24 hours (daily backups only)

### Disaster Recovery Runbook

1. **Assess the situation**
   - Identify what data was lost
   - Determine the recovery point needed

2. **Provision new infrastructure**
   - Spin up new PostgreSQL instance
   - Configure network access

3. **Restore from backup**
   - Choose appropriate backup (latest or PITR)
   - Execute restore procedure
   - Verify data integrity

4. **Update application configuration**
   - Point API servers to new database
   - Update connection strings

5. **Verify functionality**
   - Run smoke tests
   - Monitor for errors

6. **Post-mortem**
   - Document incident
   - Identify improvements

## Security

### Backup Encryption

- All backups should be encrypted at rest
- Use AWS KMS or similar for key management
- Rotate encryption keys annually

### Access Control

- Backup files: Restricted to ops team
- Restore capability: Requires two-person authorization
- Audit all backup access

### Retention and Deletion

- Follow data retention policies
- Securely delete expired backups
- Document deletion for compliance

## Testing

### Monthly Restore Test

```bash
# Create test database
docker run -d --name test-restore postgres:16-alpine

# Restore latest backup
gunzip -c /backups/latest.sql.gz | docker exec -i test-restore psql -U postgres -d postgres

# Run verification queries
docker exec test-restore psql -U postgres -d postgres -c "SELECT COUNT(*) FROM users;"

# Cleanup
docker rm -f test-restore
```

### Quarterly DR Test

1. Provision isolated environment
2. Restore from oldest available backup
3. Verify all critical functions work
4. Document results and timing
5. Update runbook if needed
