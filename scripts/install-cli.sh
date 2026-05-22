#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "Building CLI package..."
npm --prefix cli run build

PACK_DIR="$(mktemp -d)"
trap 'rm -rf "$PACK_DIR"' EXIT

echo "Packing CLI package..."
PACK_FILE="$(cd "$ROOT_DIR/cli" && npm pack --pack-destination "$PACK_DIR" --silent | tail -n 1)"
PACK_PATH="$PACK_DIR/$PACK_FILE"

echo "Installing CLI globally from package: $PACK_FILE"
npm install -g "$PACK_PATH"

echo "Installed version:"
9router --version
