#!/usr/bin/env bash
# Put the server's database back to a dump taken by snapshot.sh.
#
#   HOST=ubuntu@203.0.113.10 KEY=~/.ssh/offstage-deploy.pem scripts/deploy/restore.sh offstage-<time>.dump
#
# 1. Restores into a new database, sutradhar_restore, while the site keeps running. If that fails,
#    nothing changed.
# 2. Stops the app and the worker (a few seconds), renames the live database to sutradhar_before_<time>
#    and the restored one to sutradhar, then starts them again. The app and the worker are started
#    again even if a step fails.
# Roll back with the same rename the other way (docs/deploy.md). The name is looked up in
# /opt/sutradhar-backups on the server; a local path is uploaded first.
set -euo pipefail

: "${HOST:?HOST=ubuntu@<public ip>}"
: "${KEY:?KEY=<path to the .pem key>}"
DUMP="${1:?dump file name, for example offstage-20261024T040000Z.dump}"
SSH=(ssh -i "$KEY" -o BatchMode=yes "$HOST")
NAME=$(basename "$DUMP")
TS=$(date -u +%Y%m%dT%H%M%SZ)

if [ -f "$DUMP" ]; then
  echo "== uploading $DUMP"
  scp -i "$KEY" -q "$DUMP" "$HOST:$NAME"
  "${SSH[@]}" "sudo mkdir -p /opt/sutradhar-backups && sudo mv $NAME /opt/sutradhar-backups/"
fi

scp -i "$KEY" -q scripts/deploy/restore-remote.sh "$HOST:sutradhar-restore.sh"
OUT=$("${SSH[@]}" "sudo bash sutradhar-restore.sh $NAME $TS; rc=\$?; rm -f sutradhar-restore.sh; exit \$rc" 2>&1) || {
  echo "$OUT"
  echo "Restore failed; the live database was not changed unless the output above says it was swapped."
  exit 1
}
echo "$OUT"
grep -q "== restored" <<<"$OUT" || { echo "The restore did not finish; check the output above."; exit 1; }
echo "Restored. Check https://<DOMAIN>/api/health and run pnpm demo:preflight on the server."
