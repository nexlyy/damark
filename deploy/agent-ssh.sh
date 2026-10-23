#!/bin/sh
# For a Claude Code session in the cloud: sets up `ssh mcr` from the key kept
# in the environment's settings (variable MCR_SSH_KEY, the private key in
# base64 on one line). The server side: a user `claude` with sudo, see
# deploy/README.md. Run once per session:
#
#   sh deploy/agent-ssh.sh
#
# Then everything else works as from Anna's computer, e.g.
#   ssh mcr "sudo sh -c 'cd /root/damark && git pull && sh deploy/app.sh publish'"

set -eu

[ -n "${MCR_SSH_KEY:-}" ] || { echo "MCR_SSH_KEY is not set in this environment." >&2; exit 1; }

if ! command -v ssh >/dev/null; then
  apt-get install -y -q openssh-client >/dev/null 2>&1 || { apt-get update -q >/dev/null && apt-get install -y -q openssh-client >/dev/null; }
fi

mkdir -p ~/.ssh
chmod 700 ~/.ssh
printf '%s' "$MCR_SSH_KEY" | tr -d ' \n\r' | base64 -d > ~/.ssh/mcr
chmod 600 ~/.ssh/mcr

if ! grep -q '^Host mcr$' ~/.ssh/config 2>/dev/null; then
  cat >> ~/.ssh/config <<CONF
Host mcr
  HostName 204.168.243.140
  User claude
  IdentityFile ~/.ssh/mcr
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
  ServerAliveInterval 30
CONF
  chmod 600 ~/.ssh/config
fi

ssh -o BatchMode=yes -o ConnectTimeout=10 mcr 'echo "connected: $(whoami)@$(hostname), sudo: $(sudo -n true 2>/dev/null && echo yes || echo no)"'
