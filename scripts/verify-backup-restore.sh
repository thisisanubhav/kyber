#!/usr/bin/env bash
set -euo pipefail

KYBER_DB_HOST="${KYBER_DB_HOST:-127.0.0.1}"
KYBER_DB_PORT="${KYBER_DB_PORT:-54329}"
KYBER_DB_USER="${KYBER_DB_USER:-kyber}"
KYBER_DB_PASSWORD="${KYBER_DB_PASSWORD:-kyber_local_only}"
KYBER_DB_NAME="${KYBER_DB_NAME:-kyber}"
KYBER_RESTORE_DB="kyber_restore_check_$$"
KYBER_BACKUP_DIR="$(mktemp -d)"
export PGPASSWORD="$KYBER_DB_PASSWORD"

cleanup() {
  dropdb --if-exists --host "$KYBER_DB_HOST" --port "$KYBER_DB_PORT" --username "$KYBER_DB_USER" "$KYBER_RESTORE_DB" >/dev/null 2>&1 || true
  rm -rf "$KYBER_BACKUP_DIR"
}
trap cleanup EXIT

pg_dump --host "$KYBER_DB_HOST" --port "$KYBER_DB_PORT" --username "$KYBER_DB_USER" --dbname "$KYBER_DB_NAME" --format=custom --file "$KYBER_BACKUP_DIR/kyber.dump"
createdb --host "$KYBER_DB_HOST" --port "$KYBER_DB_PORT" --username "$KYBER_DB_USER" "$KYBER_RESTORE_DB"
pg_restore --host "$KYBER_DB_HOST" --port "$KYBER_DB_PORT" --username "$KYBER_DB_USER" --dbname "$KYBER_RESTORE_DB" --exit-on-error "$KYBER_BACKUP_DIR/kyber.dump"

SOURCE_TABLES="$(psql --host "$KYBER_DB_HOST" --port "$KYBER_DB_PORT" --username "$KYBER_DB_USER" --dbname "$KYBER_DB_NAME" --tuples-only --no-align --command "select count(*) from information_schema.tables where table_schema='public'")"
RESTORED_TABLES="$(psql --host "$KYBER_DB_HOST" --port "$KYBER_DB_PORT" --username "$KYBER_DB_USER" --dbname "$KYBER_RESTORE_DB" --tuples-only --no-align --command "select count(*) from information_schema.tables where table_schema='public'")"
SOURCE_USERS="$(psql --host "$KYBER_DB_HOST" --port "$KYBER_DB_PORT" --username "$KYBER_DB_USER" --dbname "$KYBER_DB_NAME" --tuples-only --no-align --command "select count(*) from users")"
RESTORED_USERS="$(psql --host "$KYBER_DB_HOST" --port "$KYBER_DB_PORT" --username "$KYBER_DB_USER" --dbname "$KYBER_RESTORE_DB" --tuples-only --no-align --command "select count(*) from users")"

if [[ "$SOURCE_TABLES" != "$RESTORED_TABLES" || "$SOURCE_USERS" != "$RESTORED_USERS" ]]; then
  echo "Backup verification failed: restored counts do not match" >&2
  exit 1
fi

psql --host "$KYBER_DB_HOST" --port "$KYBER_DB_PORT" --username "$KYBER_DB_USER" --dbname "$KYBER_RESTORE_DB" --command "select 1 from outbox_events limit 1" >/dev/null
echo "Backup restore verified: $RESTORED_TABLES tables and $RESTORED_USERS users restored"
