#!/bin/sh
set -eu

if [ -z "${BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
  echo "BOOTSTRAP_ADMIN_PASSWORD is required" >&2
  exit 1
fi

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set admin_password="$BOOTSTRAP_ADMIN_PASSWORD" <<'SQL'
INSERT INTO users(username,password_hash,full_name,position,department_id,role,email,initials)
VALUES ('admin',crypt(:'admin_password',gen_salt('bf',12)),'Администратор eTask','Системный администратор',NULL,'admin','admin@etask.local','АД')
ON CONFLICT (username) DO NOTHING;
SQL
