#!/bin/bash
# One-shot setup for the Eden game server on a fresh Ubuntu server (made for Oracle Cloud Always Free, ARM or x86).
# Paste it as the instance's cloud-init script when creating the server, or run it over SSH:
#   curl -fsSL https://raw.githubusercontent.com/armonon/breakthyrule-eden-showroom/main/tools/deploy/oracle-setup.sh | sudo bash
#
# It installs Docker, opens ports 80/443 in the server's own firewall, downloads the game, and runs two containers:
# the game server (accounts, live garden, expedition rooms; data in a Docker volume) and Caddy (free HTTPS certificate,
# WebSockets, streaming). Without a domain it uses <ip>.sslip.io, a free hostname that points at this server.
# It checks GitHub every 15 minutes and rebuilds when the branch has new commits, and backs up player data daily.
# Re-running it is safe. Log: /var/log/eden-setup.log
set -euo pipefail
exec > >(tee -a /var/log/eden-setup.log) 2>&1

# ---- settings (edit these, or pass them as environment variables) ----
REPO="${EDEN_REPO:-https://github.com/armonon/breakthyrule-eden-showroom.git}"
BRANCH="${EDEN_BRANCH:-main}"
DOMAIN="${EDEN_DOMAIN:-}"   # e.g. play.breakthyrule.com once its DNS A record points here; empty = <ip>.sslip.io
# ----------------------------------------------------------------------

echo "== Eden setup $(date -u +%FT%TZ): branch $BRANCH"
export DEBIAN_FRONTEND=noninteractive
APP=/opt/eden DEPLOY=/opt/eden-deploy
mkdir -p "$DEPLOY"

# Oracle's Ubuntu images reject everything but SSH in the server's own firewall. (Oracle's network "security list"
# must allow 80 and 443 too; that part is a setting in the Oracle console.)
if command -v iptables >/dev/null; then
  for port in 80 443; do
    iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport "$port" -j ACCEPT
  done
  iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT -p udp --dport 443 -j ACCEPT
  if command -v netfilter-persistent >/dev/null; then netfilter-persistent save; fi
fi

apt-get update -q
apt-get install -y -q git curl ca-certificates
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch --depth 1 origin "$BRANCH" && git -C "$APP" reset --hard FETCH_HEAD
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP"
fi

if [ -z "$DOMAIN" ]; then
  IP="$(curl -fsS --max-time 10 https://api.ipify.org || curl -fsS --max-time 10 https://ifconfig.me)"
  DOMAIN="${IP//./-}.sslip.io"
fi
echo "$DOMAIN" > "$DEPLOY/domain"
echo "$BRANCH" > "$DEPLOY/branch"

cat > "$DEPLOY/Caddyfile" <<'EOF'
{$SITE} {
	# Compress pages and scripts, but never the live API (its streams must reach players at once).
	@static not path /api/*
	encode @static zstd gzip
	reverse_proxy eden:8080 {
		flush_interval -1
	}
}
EOF

cat > "$DEPLOY/compose.yaml" <<EOF
services:
  eden:
    build: $APP
    restart: unless-stopped
    environment:
      EDEN_PUBLIC_ORIGIN: https://$DOMAIN
    volumes:
      - eden-data:/data
    stop_grace_period: 20s
  caddy:
    image: caddy:2
    restart: unless-stopped
    depends_on: [eden]
    ports: ["80:80", "443:443", "443:443/udp"]
    environment:
      SITE: $DOMAIN
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
volumes:
  eden-data: {}
  caddy-data: {}
  caddy-config: {}
EOF

# Updates: rebuild only when the branch moved. A restart keeps accounts; expedition rooms resume within 60 s.
cat > /usr/local/bin/eden-update <<'EOF'
#!/bin/bash
set -euo pipefail
cd /opt/eden
branch="$(cat /opt/eden-deploy/branch)"
before="$(git rev-parse HEAD)"
git fetch -q --depth 1 origin "$branch"
if [ "$(git rev-parse FETCH_HEAD)" != "$before" ] || [ "${1:-}" = "--force" ]; then
  git reset -q --hard FETCH_HEAD
  docker compose -p eden-deploy -f /opt/eden-deploy/compose.yaml up -d --build
  docker image prune -f >/dev/null
  echo "$(date -u +%FT%TZ) updated to $(git rev-parse --short HEAD)"
fi
EOF
chmod +x /usr/local/bin/eden-update

# Daily backup of player data (accounts, expedition checkpoints), last 14 kept. Copy them off this server too.
cat > /usr/local/bin/eden-backup <<'EOF'
#!/bin/bash
set -euo pipefail
mkdir -p /var/backups/eden && chmod 700 /var/backups/eden
docker run --rm -v eden-deploy_eden-data:/data:ro -v /var/backups/eden:/out alpine \
  tar czf "/out/eden-data-$(date -u +%Y%m%d-%H%M).tgz" -C /data .
ls -1t /var/backups/eden/eden-data-*.tgz | tail -n +15 | xargs -r rm --
EOF
chmod +x /usr/local/bin/eden-backup

cat > /etc/systemd/system/eden-update.service <<'EOF'
[Unit]
Description=Update the Eden game server from GitHub
After=docker.service network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/eden-update
EOF
cat > /etc/systemd/system/eden-update.timer <<'EOF'
[Unit]
Description=Check for Eden updates every 15 minutes
[Timer]
OnBootSec=5min
OnUnitActiveSec=15min
[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/eden-backup.service <<'EOF'
[Unit]
Description=Back up Eden player data
[Service]
Type=oneshot
ExecStart=/usr/local/bin/eden-backup
EOF
cat > /etc/systemd/system/eden-backup.timer <<'EOF'
[Unit]
Description=Daily Eden backup
[Timer]
OnCalendar=*-*-* 04:20:00
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now eden-update.timer eden-backup.timer

docker compose -p eden-deploy -f "$DEPLOY/compose.yaml" up -d --build
docker image prune -f >/dev/null || true

echo "== Waiting for the game server"
for _ in $(seq 1 60); do
  if docker compose -p eden-deploy -f "$DEPLOY/compose.yaml" exec -T eden node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null; then
    echo "== Eden is running. Play at: https://$DOMAIN/showroom"
    echo "   (The HTTPS certificate can take a minute on first start. If the page never loads, open ports 80 and 443 in"
    echo "    the Oracle console: Networking > Virtual cloud networks > your VCN > Security Lists > Add Ingress Rules.)"
    exit 0
  fi
  sleep 5
done
echo "== The game server did not answer. See: docker compose -p eden-deploy -f $DEPLOY/compose.yaml logs eden"
exit 1
