#!/bin/sh
# Gives Claude Code its own SSH login to this server: user `claude` with sudo
# and a fresh key. Prints the key once, as one line for the environment
# variable MCR_SSH_KEY in Claude Code's settings, and keeps no copy here.
# Running it again replaces the key (the old one stops working).
#
#   sh deploy/claude-access.sh          give or renew access
#   sh deploy/claude-access.sh off      take it away

set -eu
[ "$(id -u)" = 0 ] || { echo "Run as root." >&2; exit 1; }

if [ "${1:-}" = off ]; then
  rm -f /home/claude/.ssh/authorized_keys /etc/sudoers.d/claude
  echo "Claude's access is off."
  exit 0
fi

id claude >/dev/null 2>&1 || adduser --disabled-password --gecos "" claude >/dev/null
echo 'claude ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/claude
chmod 440 /etc/sudoers.d/claude
visudo -cf /etc/sudoers.d/claude >/dev/null
install -d -m 700 -o claude -g claude /home/claude/.ssh

tmp=$(mktemp -d)
ssh-keygen -q -t ed25519 -N '' -C claude-code -f "$tmp/key"
install -m 600 -o claude -g claude "$tmp/key.pub" /home/claude/.ssh/authorized_keys

echo
echo "Copy the line between the two rulers into Claude Code: environment settings -> Edit -> Environment variables, name MCR_SSH_KEY"
echo "------------------------------------------------------------------------"
base64 -w0 "$tmp/key"
echo
echo "------------------------------------------------------------------------"
rm -rf "$tmp"
