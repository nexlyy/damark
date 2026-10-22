#!/bin/sh
# Puts damark.net on the server: the link page and its images, nothing else.
# The shop demo and the other versions of the page stay off the domain until
# the real site is ready; GitHub Pages still carries them.
#
# The copy goes out as a tarball and is unpacked beside the live directory,
# which is then swapped in one move: nginx never serves a half-written tree,
# and the previous copy stays as .old to fall back to. Same as daon.pl, on the
# same machine, over the same `ssh mcr` login (or run it on the server itself).

set -eu

# Git Bash rewrites a lone "/" in arguments into its own install path.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

. "$(dirname "$0")/server.sh"
ROOT="${DAMARK_ROOT:-/var/www/damark}"

cd "$(dirname "$0")/.."

rm -rf .site
cp -r link/. .site/
rm -rf .site/v .site/variants .site/img/anna-*
find .site -name '*.md' -delete

tar -czf - -C .site . | on_server "
  set -eu
  rm -rf '$ROOT.new'
  mkdir -p '$ROOT.new'
  tar -xzf - -C '$ROOT.new'
  chmod -R a+rX '$ROOT.new'
  rm -rf '$ROOT.old'
  [ -d '$ROOT' ] && mv '$ROOT' '$ROOT.old' || true
  mv '$ROOT.new' '$ROOT'
  echo \"published \$(find '$ROOT' -type f | wc -l) files, \$(du -sh '$ROOT' | cut -f1)\"
"

rm -rf .site
