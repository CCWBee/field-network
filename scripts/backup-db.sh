#!/bin/bash
#
# Field Network Database Backup Script
#
# Creates a timestamped backup of the PostgreSQL database.
# Compresses the backup and removes old backups based on retention policy.
#
# Usage:
#   ./scripts/backup-db.sh [--dry-run]
#
# Environment variables:
#   BACKUP_DIR     - Directory to store backups (default: ./backups)
#   RETENTION_DAYS - Days to keep backups (default: 30)
#   DB_CONTAINER   - Docker container name (default: my-project-db-1)
#   DB_USER        - Database user (default: postgres)
#   DB_NAME        - Database name (default: fieldnetwork)

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DB_CONTAINER="${DB_CONTAINER:-my-project-db-1}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-fieldnetwork}"

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check for dry run mode
DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    log_warn "Dry run mode - no changes will be made"
fi

# Create backup directory if it doesn't exist
if [[ "$DRY_RUN" == false ]]; then
    mkdir -p "$BACKUP_DIR"
    log_info "Backup directory: $BACKUP_DIR"
fi

# Check if Docker container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    # Try docker-compose service name
    DB_CONTAINER=$(docker-compose ps -q db 2>/dev/null || echo "")
    if [[ -z "$DB_CONTAINER" ]]; then
        log_error "Database container not found. Is Docker running?"
        exit 1
    fi
fi

log_info "Using container: $DB_CONTAINER"

# Create the backup
log_info "Creating backup: ${BACKUP_FILE}"

if [[ "$DRY_RUN" == false ]]; then
    docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"

    if [[ ! -f "$BACKUP_FILE" ]]; then
        log_error "Backup file was not created"
        exit 1
    fi

    # Check backup file size
    BACKUP_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null)
    if [[ "$BACKUP_SIZE" -lt 1000 ]]; then
        log_error "Backup file is suspiciously small ($BACKUP_SIZE bytes)"
        exit 1
    fi

    log_info "Backup created: $(du -h "$BACKUP_FILE" | cut -f1)"
fi

# Compress the backup
log_info "Compressing backup..."

if [[ "$DRY_RUN" == false ]]; then
    gzip "$BACKUP_FILE"
    COMPRESSED_FILE="${BACKUP_FILE}.gz"
    log_info "Compressed: $(du -h "$COMPRESSED_FILE" | cut -f1)"
fi

# Verify the compressed backup
if [[ "$DRY_RUN" == false ]]; then
    log_info "Verifying backup integrity..."
    if gunzip -t "${BACKUP_FILE}.gz"; then
        log_info "Backup verified successfully"
    else
        log_error "Backup verification failed!"
        exit 1
    fi
fi

# Remove old backups
log_info "Cleaning up backups older than $RETENTION_DAYS days..."

if [[ "$DRY_RUN" == false ]]; then
    OLD_BACKUPS=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} 2>/dev/null || true)
    if [[ -n "$OLD_BACKUPS" ]]; then
        echo "$OLD_BACKUPS" | while read -r file; do
            log_info "Removing: $file"
            rm -f "$file"
        done
    else
        log_info "No old backups to remove"
    fi
else
    OLD_COUNT=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} 2>/dev/null | wc -l || echo "0")
    log_info "Would remove $OLD_COUNT old backup(s)"
fi

# List current backups
log_info "Current backups:"
if [[ -d "$BACKUP_DIR" ]]; then
    ls -lh "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null || log_info "No backups found"
fi

# Calculate total backup size
if [[ "$DRY_RUN" == false && -d "$BACKUP_DIR" ]]; then
    TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "unknown")
    log_info "Total backup storage: $TOTAL_SIZE"
fi

log_info "Backup complete!"
