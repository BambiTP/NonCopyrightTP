#!/usr/bin/env bash
# One-time (re-runnable) setup on an Ubuntu server. Run as root from inside the project:
#   bash deploy/setup.sh                              # HTTPS on <ip-with-dashes>.sslip.io
#   DOMAIN=tagpro.example.com bash deploy/setup.sh    # HTTPS on your own domain (point its A record here first)
#   TUNNEL_TOKEN=<token> bash deploy/setup.sh         # behind a Cloudflare Tunnel instead of Caddy (see below)
# Cloudflare Tunnel: in the Cloudflare dashboard (Zero Trust > Networks > Tunnels) create a tunnel, add a
# public hostname on your domain pointing at http://localhost:3000, and copy its token. cloudflared
# then connects out to Cloudflare, so the server needs no open web ports, no certificate and no public IP.
# sslip.io is a free wildcard DNS service: 1-2-3-4.sslip.io resolves to 1.2.3.4, so Caddy can get a
# free Let's Encrypt certificate without registering a domain.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export DEBIAN_FRONTEND=noninteractive

echo "== installing Node.js, git, ${TUNNEL_TOKEN:+cloudflared}${TUNNEL_TOKEN:-Caddy}"
apt-get update -y
apt-get install -y curl git ca-certificates gnupg
# prefer the distro packages (recent Ubuntu ships Node >= 18 and Caddy); fall back to upstream repos
apt-get install -y nodejs npm || true
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
if [ -z "${TUNNEL_TOKEN:-}" ] && ! command -v caddy >/dev/null; then
  apt-get install -y caddy || {
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y && apt-get install -y caddy
  }
fi
node -v; [ -n "${TUNNEL_TOKEN:-}" ] || caddy version | head -1

echo "== installing app dependencies"
cd "$APP_DIR"
npm ci --omit=dev
bash deploy/fetch-music.sh || echo "(music download failed - the game works without it)"

echo "== service user (the game does not run as root)"
id tagpro >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin tagpro
mkdir -p "$APP_DIR/data"
chown -R tagpro:tagpro "$APP_DIR"

echo "== systemd service (listens on localhost only; ${TUNNEL_TOKEN:+cloudflared}${TUNNEL_TOKEN:-Caddy} is the public front)"
cat > /etc/systemd/system/tagpro.service <<UNIT
[Unit]
Description=BambiPro
After=network.target

[Service]
User=tagpro
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) server/index.js
Environment=PORT=3000 HOST=127.0.0.1 NODE_ENV=production
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$APP_DIR/maps $APP_DIR/data

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable tagpro
systemctl restart tagpro

if [ -n "${TUNNEL_TOKEN:-}" ]; then
  echo "== Cloudflare Tunnel -> localhost:3000"
  if ! command -v cloudflared >/dev/null; then
    mkdir -p --mode=0755 /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list
    apt-get update -y && apt-get install -y cloudflared
  fi
  cloudflared --version
  # re-runs replace the old service (e.g. a new token)
  cloudflared service uninstall >/dev/null 2>&1 || true
  cloudflared service install "$TUNNEL_TOKEN"
  systemctl enable --now cloudflared
  echo "== firewall: only SSH (web traffic arrives through the tunnel)"
  apt-get install -y ufw
  ufw allow OpenSSH >/dev/null
  ufw delete allow 80/tcp >/dev/null 2>&1 || true
  ufw delete allow 443/tcp >/dev/null 2>&1 || true
  ufw --force enable
  if systemctl is-active --quiet caddy; then systemctl disable --now caddy; fi
  echo
  echo "Done. Open the public hostname you gave the tunnel in the Cloudflare dashboard (add /groups)."
  exit 0
fi

echo "== Caddy: HTTPS + websockets -> localhost:3000"
IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
DOMAIN="${DOMAIN:-${IP//./-}.sslip.io}"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  encode gzip
  # browsers always use https here after the first visit (no unencrypted first request to intercept)
  header Strict-Transport-Security "max-age=31536000"
  reverse_proxy localhost:3000
}

# visiting the bare IP redirects to the HTTPS address
http://$IP {
  redir https://$DOMAIN{uri}
}
CADDY
systemctl restart caddy

echo "== firewall: only SSH and web"
apt-get install -y ufw
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable

echo
echo "Done. Open: https://$DOMAIN/groups"
