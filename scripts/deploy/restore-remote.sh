#!/usr/bin/env bash
# Runs on the server as root, called by scripts/deploy/restore.sh: restore-remote.sh <dump name> <stamp>
set -euo pipefail
NAME="$1"
TS="${2,,}"  # Postgres folds unquoted names to lower case
cd /opt/sutradhar
test -f "/opt/sutradhar-backups/$NAME" || { echo "no such dump on the server: $NAME"; exit 1; }
# </dev/null everywhere: docker compose exec would otherwise read this script's stdin.
psql_admin() { docker compose exec -T db psql -U sutradhar -d postgres -v ON_ERROR_STOP=1 -q -c "$1" </dev/null; }

echo "== restoring $NAME into sutradhar_restore (the site stays up)"
psql_admin "drop database if exists sutradhar_restore with (force)" 2>/dev/null
psql_admin "create database sutradhar_restore"
docker compose exec -T db pg_restore -U sutradhar -d sutradhar_restore --no-owner --exit-on-error \
  <"/opt/sutradhar-backups/$NAME"

echo "== swapping databases (app and worker stopped for a moment)"
trap 'docker compose --profile cloud start app worker >/dev/null 2>&1 </dev/null; echo "== app and worker started"' EXIT
docker compose --profile cloud stop app worker >/dev/null 2>&1 </dev/null
psql_admin "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'sutradhar' and pid <> pg_backend_pid()" >/dev/null
psql_admin "alter database sutradhar rename to sutradhar_before_$TS"
psql_admin "alter database sutradhar_restore rename to sutradhar"
echo "   previous database kept as sutradhar_before_$TS"
echo "== restored"
