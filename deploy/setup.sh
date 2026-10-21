#!/bin/sh
# Puts damark.net on the nginx that already serves daon.pl, in three steps:
#
#   sh deploy/setup.sh http    the site over plain HTTP, ready for certbot
#   sh deploy/setup.sh cert    a Let's Encrypt certificate; DNS must point here first
#   sh deploy/setup.sh https   the full config: HTTPS, redirects, caching
#   sh deploy/setup.sh renew   reload nginx after each renewal, then a test renewal
#
# Every config step runs `nginx -t` before reloading. If the test fails, the
# previous damark.net file is put back and nothing is reloaded, so a mistake
# here can never take daon.pl down with it. If the login is not root, run with
# DAMARK_SUDO=sudo.

set -eu
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

. "$(dirname "$0")/server.sh"
S="${DAMARK_SUDO:-}"

cd "$(dirname "$0")"

install_conf() {
  on_server 'cat > /tmp/damark.net.conf' < "$1"
  on_server "
    set -eu
    site=/etc/nginx/sites-available/damark.net
    $S mkdir -p /var/www/html /var/www/damark
    if [ -f \$site ]; then $S cp \$site \$site.prev; fi
    $S cp /tmp/damark.net.conf \$site
    $S ln -sf \$site /etc/nginx/sites-enabled/damark.net
    if $S nginx -t 2>/tmp/damark-nginx-test; then
      $S systemctl reload nginx
      echo 'nginx reloaded with the new damark.net config'
    else
      cat /tmp/damark-nginx-test
      if [ -f \$site.prev ]; then $S mv \$site.prev \$site; else $S rm -f \$site /etc/nginx/sites-enabled/damark.net; fi
      echo 'nginx test failed: the previous damark.net config is back, nothing was reloaded' >&2
      exit 1
    fi
  "
}

# certonly --webroot leaves nginx alone, so a renewed certificate would sit on
# disk unused until the one nginx holds expired. This hook reloads nginx after
# every renewal, daon.pl's included; a reload drops no connections.
install_renew_hook() {
  on_server "
    set -eu
    hook=/etc/letsencrypt/renewal-hooks/deploy/reload-nginx
    $S mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    printf '#!/bin/sh\nsystemctl reload nginx\n' | $S tee \$hook >/dev/null
    $S chmod 755 \$hook
    echo \"renewals now reload nginx (\$hook)\"
  "
}

case "${1:-}" in
  http)
    install_conf nginx-damark-http.conf
    echo "Check before DNS moves: curl --resolve damark.net:80:$IP http://damark.net/"
    ;;
  cert)
    for name in damark.net www.damark.net; do
      got=$(on_server "getent ahostsv4 $name | awk '{print \$1}' | sort -u | tr '\n' ' '" || true)
      case " $got" in
        *" $IP "*) echo "$name → $IP" ;;
        *) echo "$name does not point at $IP yet (it answers: ${got:-nothing}). Change the A record and wait." >&2; exit 1 ;;
      esac
    done
    on_server "$S certbot certonly --webroot -w /var/www/html -d damark.net -d www.damark.net --non-interactive --keep-until-expiring"
    install_renew_hook
    ;;
  renew)
    install_renew_hook
    on_server "$S certbot renew --cert-name damark.net --dry-run"
    ;;
  https)
    on_server "$S test -f /etc/letsencrypt/live/damark.net/fullchain.pem" \
      || { echo "No certificate for damark.net yet: run 'sh deploy/setup.sh cert' first." >&2; exit 1; }
    install_conf nginx-damark.conf
    echo "Open https://damark.net/"
    ;;
  *)
    echo "usage: sh deploy/setup.sh http | cert | https | renew" >&2
    exit 2
    ;;
esac
