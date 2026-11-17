#!/usr/bin/env bash
# Install or update the tells API on this box. Nothing changes unless you pass --yes.
#   deploy/install.sh            show what would happen
#   deploy/install.sh --yes      do it
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=$(pwd)
YES=${1:-}
PORT=$(grep -E '^TELLS_PORT=' /etc/tells-api.env 2>/dev/null | cut -d= -f2 || true)
PORT=${PORT:-3791}

say() { printf '==> %s\n' "$*"; }
run() { if [[ "$YES" == "--yes" ]]; then "$@"; else printf '    would run: %s\n' "$*"; fi; }

say "checks"
command -v node >/dev/null || { echo "node is missing"; exit 1; }
[[ -f /etc/letsencrypt/live/nexugen.app/fullchain.pem ]] || { echo "wildcard certificate not found"; exit 1; }
if ss -ltn | grep -q ":$PORT "; then
  systemctl is-active --quiet tells-api || { echo "port $PORT is taken by something else"; exit 1; }
fi
getent hosts tells.nexugen.app >/dev/null || echo "    note: tells.nexugen.app does not resolve yet"

say "build"
run npm ci --no-audit --no-fund
run npm run build
run npm test

say "copy to /opt/tells"
run mkdir -p /opt/tells
run rsync -a --delete --exclude node_modules --exclude .git --exclude bench/out "$REPO/" /opt/tells/
run bash -c "cd /opt/tells && npm ci --omit=dev --no-audit --no-fund && npm install --no-save --no-audit --no-fund @anthropic-ai/sdk@^1.10.0"

say "config"
if [[ ! -f /etc/tells-api.env ]]; then
  run install -m 600 deploy/tells-api.env.example /etc/tells-api.env
  echo "    edit /etc/tells-api.env before turning rewrite on"
fi

say "service"
run install -m 644 deploy/tells-api.service /etc/systemd/system/tells-api.service
run systemctl daemon-reload
run systemctl enable --now tells-api
run systemctl restart tells-api

say "nginx"
run install -m 644 deploy/nginx-tells.conf /etc/nginx/sites-available/tells
run ln -sf /etc/nginx/sites-available/tells /etc/nginx/sites-enabled/tells
if [[ "$YES" == "--yes" ]]; then
  nginx -t
  systemctl reload nginx
fi

say "health"
if [[ "$YES" == "--yes" ]]; then
  sleep 1
  curl -fsS "http://127.0.0.1:$PORT/health" && echo
  curl -fsS https://tells.nexugen.app/health && echo
fi
