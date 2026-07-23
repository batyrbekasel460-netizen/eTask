#!/bin/sh
set -eu

: "${PGHOST:?PGHOST is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"

retention_days="${BACKUP_RETENTION_DAYS:-30}"
case "$retention_days" in (*[!0-9]*|'') echo "BACKUP_RETENTION_DAYS must be an integer" >&2; exit 1;; esac

umask 077
mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
database_file="$BACKUP_DIR/etask-db-$timestamp.dump"
temporary_file="$database_file.partial"

trap 'rm -f "$temporary_file"' EXIT INT TERM
pg_dump --format=custom --compress=9 --no-owner --no-acl --file="$temporary_file" "$PGDATABASE"
pg_restore --list "$temporary_file" >/dev/null
mv "$temporary_file" "$database_file"
sha256sum "$database_file" > "$database_file.sha256"

if [ -d "${UPLOAD_SOURCE:-/uploads}" ]; then
  uploads_file="$BACKUP_DIR/etask-uploads-$timestamp.tar.gz"
  tar -C "${UPLOAD_SOURCE:-/uploads}" -czf "$uploads_file" .
  sha256sum "$uploads_file" > "$uploads_file.sha256"
fi

find "$BACKUP_DIR" -type f \( -name 'etask-db-*.dump' -o -name 'etask-db-*.dump.sha256' -o -name 'etask-uploads-*.tar.gz' -o -name 'etask-uploads-*.tar.gz.sha256' \) -mtime "+$retention_days" -delete
echo "Backup completed: $database_file"
