#!/usr/bin/env bash
# Ship the current commit to the EC2 host and (re)start the stack. See docs/deploy.md.
#
#   HOST=ubuntu@<ip> KEY=~/.ssh/sutradhar.pem ENV_FILE=.env.cloud scripts/deploy/deploy.sh [--seed]
#
# --seed wipes and seeds the demo world (pnpm demo:reset, which also indexes the KB). Use it on the first
# deploy and when you want a fresh demo; without it the database is kept.
set -euo pipefail

: "${HOST:?HOST=ubuntu@<public ip>}"
: "${KEY:?KEY=<path to the .pem key>}"
ENV_FILE="${ENV_FILE:-.env.cloud}"
SEED=0
[ "${1:-}" = "--seed" ] && SEED=1

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (copy .env and apply the cloud changes in docs/deploy.md)"; exit 1; }
grep -q '^DOMAIN=' "$ENV_FILE" || { echo "$ENV_FILE needs DOMAIN=<host name>"; exit 1; }

SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST")
REV=$(git rev-parse --short HEAD)
TAR=$(mktemp -t sutradhar-XXXX.tar.gz)
git archive --format=tar.gz -o "$TAR" HEAD
echo "Shipping $REV ($(du -h "$TAR" | cut -f1))"
[ -s "$TAR" ] || { echo "git archive produced nothing"; exit 1; }
# Copy into the remote home with relative names (no absolute remote paths: Git Bash on Windows
# rewrites them), then move them where remote.sh expects them.
scp -i "$KEY" -q "$TAR" "$HOST:sutradhar.tar.gz"
scp -i "$KEY" -q "$ENV_FILE" "$HOST:sutradhar.env"
scp -i "$KEY" -q scripts/deploy/remote.sh "$HOST:sutradhar-remote.sh"
rm -f "$TAR"
"${SSH[@]}" "sudo mv sutradhar.tar.gz sutradhar.env sutradhar-remote.sh /tmp/ && sudo SEED=$SEED REV=$REV bash /tmp/sutradhar-remote.sh"
