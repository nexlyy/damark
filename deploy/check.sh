#!/bin/sh
# What the server has room for and what it already serves, before damark.net
# goes on it. Changes nothing.

set -eu
export MSYS_NO_PATHCONV=1
. "$(dirname "$0")/server.sh"

on_server '
  echo "== disk";            df -h / /var/www 2>/dev/null
  echo "== web roots";       du -sh /var/www/* 2>/dev/null
  echo "== memory";          free -h
  echo "== nginx";           nginx -v 2>&1; ls /etc/nginx/sites-enabled
  echo "== certificates";    ls /etc/letsencrypt/live 2>/dev/null; command -v certbot || echo "certbot not installed"
  echo "== damark.net now";  ls -la /var/www/damark 2>/dev/null | head -5 || true
  [ -d /var/www/damark ] || echo "not there yet"
  echo "== where damark.net points"; getent hosts damark.net www.damark.net || echo "not resolving yet"
'
