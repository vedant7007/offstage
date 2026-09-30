#!/usr/bin/env bash
# Runs on the EC2 host as root, called by scripts/deploy/deploy.sh. Idempotent.
set -euo pipefail
APP=/opt/sutradhar
SEED="${SEED:-0}"

if ! command -v docker >/dev/null; then
  echo "== installing Docker"
  apt-get update -qq
  apt-get install -y -qq docker.io docker-compose-v2 >/dev/null
  systemctl enable --now docker
fi

# The Next.js build needs more than a small instance's memory.
if ! swapon --show | grep -q /swapfile; then
  echo "== adding 4 GB swap"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

echo "== unpacking ${REV:-unknown}"
mkdir -p "$APP"
find "$APP" -mindepth 1 -maxdepth 1 ! -name .env -exec rm -rf {} +
tar -xzf /tmp/sutradhar.tar.gz -C "$APP"
install -m 600 /tmp/sutradhar.env "$APP/.env"
rm -f /tmp/sutradhar.tar.gz /tmp/sutradhar.env
cd "$APP"

DC=(docker compose --profile cloud)
echo "== building the image"
"${DC[@]}" build app

echo "== database"
docker compose up -d db mailpit
"${DC[@]}" run --rm --no-deps app pnpm db:migrate
if [ "$SEED" = "1" ]; then
  # demo:reset also indexes the knowledge base and sets the demo clock.
  echo "== seeding the demo world"
  "${DC[@]}" run --rm --no-deps app pnpm demo:reset
fi

echo "== starting app, worker and Caddy"
"${DC[@]}" up -d app worker caddy
DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2-)
for _ in $(seq 1 30); do
  if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    echo "== up: https://$DOMAIN"
    exit 0
  fi
  sleep 5
done
echo "Health check did not pass yet. Logs: docker compose --profile cloud logs --tail 100 app caddy"
exit 1
