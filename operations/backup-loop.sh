#!/bin/sh
set -eu

interval="${BACKUP_INTERVAL_SECONDS:-86400}"
case "$interval" in (*[!0-9]*|'') echo "BACKUP_INTERVAL_SECONDS must be an integer" >&2; exit 1;; esac

while true; do
  /scripts/backup.sh
  sleep "$interval"
done
