#!/bin/sh
set -eu

if [ "${CONFIRM_RESTORE:-}" != "YES" ]; then
  echo "Restore is destructive. Set CONFIRM_RESTORE=YES." >&2
  exit 1
fi
if [ "$#" -ne 1 ]; then
  echo "Usage: restore.sh /backups/etask-db-TIMESTAMP.dump" >&2
  exit 1
fi

backup_file="$1"
test -f "$backup_file"
test -f "$backup_file.sha256"
(cd "$(dirname "$backup_file")" && sha256sum -c "$(basename "$backup_file").sha256")
pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --dbname="$PGDATABASE" "$backup_file"
echo "Restore completed: $backup_file"
