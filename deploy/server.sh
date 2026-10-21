# Sourced by the other deploy scripts. They run either from a computer where
# `ssh mcr` logs in, or on the server itself after cloning the repo there; in
# that case commands run directly instead of over ssh. DAMARK_HOST overrides
# the guess: a host name for ssh, or "local".

IP="${DAMARK_IP:-204.168.243.140}"

if [ -n "${DAMARK_HOST:-}" ]; then
  HOST="$DAMARK_HOST"
elif ip -4 addr 2>/dev/null | grep -q "inet $IP/"; then
  HOST=local
else
  HOST=mcr
fi

on_server() {
  if [ "$HOST" = local ]; then sh -c "$1"; else ssh "$HOST" "$1"; fi
}
