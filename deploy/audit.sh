#!/bin/sh
# How the server stands on the usual security basics: updates, ssh login,
# firewall, certificate renewal. Changes nothing; run it as root so sshd and
# certbot can answer.

set -eu
export MSYS_NO_PATHCONV=1
. "$(dirname "$0")/server.sh"

on_server '
  echo "== updates waiting"; apt list --upgradable 2>/dev/null | grep -c upgradable || true
  [ -f /var/run/reboot-required ] && echo "restart required" || echo "no restart needed"
  echo "== automatic security updates"; cat /etc/apt/apt.conf.d/20auto-upgrades 2>/dev/null || echo "not set up"
  echo "== ssh login"; sshd -T 2>/dev/null | grep -Ei "^(port|permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication) "
  echo "== keys that can log in as root"; cat /root/.ssh/authorized_keys 2>/dev/null | grep -c . || true
  echo "== failed ssh logins, last 24 h"; journalctl -u ssh --since -24h 2>/dev/null | grep -Ec "Failed|Invalid user" || true
  echo "== fail2ban"; systemctl is-active fail2ban 2>/dev/null || true
  echo "== firewall"; ufw status verbose 2>/dev/null || echo "ufw not installed"
  echo "== listening ports"; ss -tlnpH | awk "{print \$4, \$6}" | sort -u
  echo "== certificates"; certbot certificates 2>/dev/null | grep -E "Certificate Name|Expiry" || true
  echo "== renewal"; systemctl list-timers --all 2>/dev/null | grep -i certbot || echo "no certbot timer"
  ls /etc/letsencrypt/renewal-hooks/deploy 2>/dev/null || true
  echo "== site files"; stat -c "%U:%G %a %n" /var/www/damark /var/www/damark/index.html 2>/dev/null || true
'
