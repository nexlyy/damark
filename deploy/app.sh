#!/bin/sh
# The shop at new.damark.net, on the server that already runs daon.pl and
# damark.net. Run as root in the repo clone on the server (~/damark):
#
#   sh deploy/app.sh setup      once: user, Node 22, folders, service, password, nginx (HTTP)
#   sh deploy/app.sh cert       once, after DNS: Let's Encrypt certificate
#   sh deploy/app.sh https      once: the full nginx config
#   sh deploy/app.sh publish    every update: build, switch, restart; rolls back if it fails
#   sh deploy/app.sh user add <login> "<Name>" owner|manager|dev
#   sh deploy/app.sh user password <login>
#   sh deploy/app.sh password   a new site password (the one before the site opens)
#   sh deploy/app.sh status     is it running, last log lines
#
# The shop gets its own Node 22 in /opt/damark/node, so daon.pl's Node stays
# as it is. Its data (database, photos, backups) is in /var/lib/damark.

set -eu

DOMAIN=new.damark.net
IP=204.168.243.140
BASE=/opt/damark
DATA=/var/lib/damark
ENV=/etc/damark/app.env
PORT=8810
NODE_MAJOR=22

cd "$(dirname "$0")/.."
REPO=$(pwd)
export PATH="$BASE/node/bin:$PATH"

[ "$(id -u)" = 0 ] || { echo "Run as root." >&2; exit 1; }

install_node() {
  if [ -x "$BASE/node/bin/node" ] && "$BASE/node/bin/node" -v | grep -q "^v$NODE_MAJOR\."; then
    echo "Node $("$BASE/node/bin/node" -v) already in $BASE/node"
    return
  fi
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64) arch=arm64 ;;
    *) echo "Unknown CPU $(uname -m)" >&2; exit 1 ;;
  esac
  tmp=$(mktemp -d)
  url="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
  curl -fsSL "$url/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  file=$(grep -o "node-v$NODE_MAJOR\.[0-9.]*-linux-$arch\.tar\.xz" "$tmp/SHASUMS256.txt" | head -1)
  curl -fsSL "$url/$file" -o "$tmp/$file"
  # The archive must match nodejs.org's published checksum.
  (cd "$tmp" && grep " $file\$" SHASUMS256.txt | sha256sum -c -)
  dir="$BASE/${file%.tar.xz}"
  mkdir -p "$dir"
  tar -xJf "$tmp/$file" -C "$dir" --strip-components=1
  ln -sfn "$dir" "$BASE/node"
  rm -rf "$tmp"
  echo "Installed $("$BASE/node/bin/node" -v) in $BASE/node"
}

nginx_install() {
  site=/etc/nginx/sites-available/$DOMAIN
  [ -f "$site" ] && cp "$site" "$site.prev"
  cp "$1" "$site"
  ln -sf "$site" "/etc/nginx/sites-enabled/$DOMAIN"
  if nginx -t 2>/tmp/damark-app-nginx; then
    systemctl reload nginx
    echo "nginx reloaded"
  else
    cat /tmp/damark-app-nginx
    if [ -f "$site.prev" ]; then mv "$site.prev" "$site"; else rm -f "$site" "/etc/nginx/sites-enabled/$DOMAIN"; fi
    echo "nginx test failed: previous config restored, nothing reloaded" >&2
    exit 1
  fi
}

new_password() {
  pass=$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-14)
  printf 'damark:%s\n' "$(openssl passwd -6 "$pass")" > /etc/nginx/damark.htpasswd
  chown root:www-data /etc/nginx/damark.htpasswd
  chmod 640 /etc/nginx/damark.htpasswd
  echo
  echo "Site password for https://$DOMAIN (until the shop opens):"
  echo "  login:    damark"
  echo "  password: $pass"
  echo
}

health() {
  i=0
  while [ $i -lt 20 ]; do
    if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/shop"; then return 0; fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

case "${1:-}" in
  setup)
    id damark >/dev/null 2>&1 || useradd --system --home-dir "$BASE" --shell /usr/sbin/nologin damark
    mkdir -p "$BASE/releases" "$DATA/media" "$DATA/db" "$DATA/backups" /etc/damark /var/www/html
    chown -R damark:damark "$DATA"
    # Others may reach photos (nginx), never the database or backups.
    chmod 711 "$DATA"
    chmod 755 "$DATA/media"
    chmod 700 "$DATA/db" "$DATA/backups"
    install_node
    if [ ! -f "$ENV" ]; then
      cat > "$ENV" <<EOF
NODE_ENV=production
TZ=Europe/Kyiv
HOST=127.0.0.1
PORT=$PORT
DATA_DIR=$DATA
WEB_DIR=$BASE/current/dist/web
PUBLIC_URL=https://$DOMAIN
SECURE_COOKIES=true
SERVE_STATIC=false
EOF
      chmod 640 "$ENV"
      chown root:damark "$ENV"
    fi
    cp deploy/damark.service /etc/systemd/system/damark.service
    systemctl daemon-reload
    systemctl enable damark >/dev/null
    [ -f /etc/nginx/damark.htpasswd ] || new_password
    # HTTP only, so certbot can check the domain.
    sed -n '1,/^}/p' deploy/nginx-app.conf > /tmp/damark-app-http.conf
    nginx_install /tmp/damark-app-http.conf
    echo "Next: point $DOMAIN at $IP in DNS, then: sh deploy/app.sh cert"
    ;;

  cert)
    got=$(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u | tr '\n' ' ')
    case " $got" in
      *" $IP "*) ;;
      *) echo "$DOMAIN does not point at $IP yet (answers: ${got:-nothing}). Add the A record and wait." >&2; exit 1 ;;
    esac
    certbot certonly --webroot -w /var/www/html -d "$DOMAIN" --non-interactive --keep-until-expiring
    mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
    chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
    echo "Next: sh deploy/app.sh https"
    ;;

  https)
    [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ] || { echo "No certificate yet: sh deploy/app.sh cert" >&2; exit 1; }
    nginx_install deploy/nginx-app.conf
    [ -e "$BASE/current" ] || echo "Next: sh deploy/app.sh publish"
    ;;

  publish)
    command -v node >/dev/null || { echo "Run setup first." >&2; exit 1; }
    stamp=$(date +%Y%m%d-%H%M%S)
    release="$BASE/releases/$stamp"
    echo "Building in $REPO/app with $(node -v)…"
    (cd app && npm ci --no-audit --no-fund && npm test && npm run build)
    mkdir -p "$release"
    cp -r app/dist app/package.json app/package-lock.json "$release/"
    (cd "$release" && npm ci --omit=dev --no-audit --no-fund)
    git -C "$REPO" rev-parse --short HEAD > "$release/REVISION" 2>/dev/null || true
    previous=$(readlink "$BASE/current" 2>/dev/null || true)
    ln -sfn "$release" "$BASE/current"
    systemctl restart damark
    if health; then
      echo "Published $(cat "$release/REVISION" 2>/dev/null || echo "$stamp"): https://$DOMAIN"
      # Keep the last three releases.
      ls -1d "$BASE"/releases/* | sort | head -n -3 | xargs -r rm -rf
    else
      echo "The new version did not start. Last log lines:" >&2
      journalctl -u damark -n 30 --no-pager >&2 || true
      if [ -n "$previous" ]; then
        ln -sfn "$previous" "$BASE/current"
        systemctl restart damark
        echo "Rolled back to $previous" >&2
      fi
      exit 1
    fi
    ;;

  user)
    shift
    [ -e "$BASE/current" ] || { echo "Publish first." >&2; exit 1; }
    cd "$BASE/current"
    set -a
    . "$ENV"
    set +a
    runuser -u damark -- "$BASE/node/bin/node" dist/server/cli.js "$@"
    ;;

  password)
    new_password
    systemctl reload nginx
    ;;

  status)
    systemctl --no-pager status damark | head -12 || true
    echo
    curl -fsS -o /dev/null -w "API: %{http_code}\n" "http://127.0.0.1:$PORT/api/shop" || echo "API: not answering"
    echo "Release: $(readlink "$BASE/current" 2>/dev/null || echo none) ($(cat "$BASE/current/REVISION" 2>/dev/null || echo '?'))"
    du -sh "$DATA/media" "$DATA/db" "$DATA/backups" 2>/dev/null || true
    journalctl -u damark -n 15 --no-pager 2>/dev/null || true
    ;;

  *)
    sed -n '2,15p' "$0"
    exit 2
    ;;
esac
