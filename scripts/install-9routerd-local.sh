#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_DIR="$ROOT_DIR/packages/cli"

log() {
  printf '\n[install-9routerd] %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '[install-9routerd] Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

require_command node
require_command npm

log "Using Node $(node --version) and npm $(npm --version)"
log "Repository: $ROOT_DIR"
log "Global npm prefix: $(npm prefix -g)"

cd "$ROOT_DIR"

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  if [ -f "$ROOT_DIR/package-lock.json" ]; then
    log "Installing dependencies with npm ci"
    npm ci
  else
    log "Installing dependencies with npm install"
    npm install
  fi
fi

log "Building 9Router production app"
npm run build

log "Removing old local 9routerd tarballs"
rm -f "$CLI_DIR"/9routerd-*.tgz

log "Packing 9routerd CLI package"
PACK_OUTPUT="$(cd "$CLI_DIR" && npm pack --silent)"
printf '%s\n' "$PACK_OUTPUT"
PACK_FILE="$(printf '%s\n' "$PACK_OUTPUT" | awk '/\.tgz$/ { file = $0 } END { print file }')"
TARBALL="$CLI_DIR/$PACK_FILE"

if [ -z "$PACK_FILE" ] || [ ! -f "$TARBALL" ]; then
  printf '[install-9routerd] Expected tarball was not created: %s\n' "$TARBALL" >&2
  exit 1
fi

log "Installing $TARBALL globally"
npm install -g "$TARBALL"

log "Verifying global 9routerd command"
command -v 9routerd
9routerd --help >/dev/null

log "Installed package"
npm list -g --depth=0 9routerd

log "Current service status"
9routerd status

cat <<'EOF'

[install-9routerd] Done.
Start the service with:
  9routerd start
EOF
