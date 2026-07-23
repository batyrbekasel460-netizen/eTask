#!/bin/sh
set -eu

if [ "${CONFIRM_RESTORE:-}" != "YES" ]; then
  echo "Restore is destructive. Set CONFIRM_RESTORE=YES." >&2
  exit 1
fi
if [ "$#" -ne 1 ]; then
  echo "Usage: restore-uploads.sh /backups/etask-uploads-TIMESTAMP.tar.gz" >&2
  exit 1
fi

archive="$1"
test -f "$archive"
test -f "$archive.sha256"
(cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive").sha256")
tar -tzf "$archive" >/dev/null
find /uploads -mindepth 1 -delete
tar -C /uploads -xzf "$archive"
echo "Uploads restore completed: $archive"
