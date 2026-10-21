#!/bin/sh
# Builds damark.net and puts it on the server: the link page at the root, the
# shop template under /shop/, the other link-page variants under /v/ and
# /variants/.
#
# The copy goes out as a tarball and is unpacked beside the live directory,
# which is then swapped in one move: nginx never serves a half-written tree,
# and the previous build stays as .old to fall back to. Same as daon.pl, on the
# same machine, over the same `ssh mcr` login (or run it on the server itself).

set -eu

# Git Bash rewrites a lone "/" in arguments into its own install path.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

. "$(dirname "$0")/server.sh"
ROOT="${DAMARK_ROOT:-/var/www/damark}"
URL="${DAMARK_URL:-https://damark.net/}"

cd "$(dirname "$0")/.."

(cd shop && npm ci --no-audit --no-fund && npm run build)

rm -rf .site
mkdir -p .site/shop
cp -r link/. .site/
find .site -name '*.md' -delete
cp -r shop/dist/. .site/shop/

# Link previews name the page's own address; on the server that is the
# domain, not the GitHub Pages copy. -i.bak works with GNU and BSD sed alike.
find .site -name '*.html' -exec sed -i.bak "s#https://nexlyy.github.io/damark/#$URL#g" {} +
find .site -name '*.bak' -delete

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
