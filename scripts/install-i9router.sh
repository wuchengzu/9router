#!/usr/bin/env bash
set -euo pipefail

COMMAND_NAME=${COMMAND_NAME:-i9router}
PORT=${PORT:-20128}
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$REPO_DIR/package.json" ]]; then
  echo "Error: package.json not found in $REPO_DIR" >&2
  exit 1
fi

choose_bin_dir() {
  if [[ -n "${BIN_DIR:-}" ]]; then
    echo "$BIN_DIR"
    return
  fi

  for dir in "$HOME/.local/bin" /usr/local/bin /opt/homebrew/bin; do
    if [[ -d "$dir" && -w "$dir" ]]; then
      echo "$dir"
      return
    fi
  done

  echo "/usr/local/bin"
}

BIN_DIR="$(choose_bin_dir)"
TARGET="$BIN_DIR/$COMMAND_NAME"

mkdir -p "$BIN_DIR"

cat > "$TARGET" <<EOF
#!/usr/bin/env bash
set -euo pipefail

cd "$REPO_DIR"
PORT="\${PORT:-$PORT}" npm run start
EOF

chmod +x "$TARGET"

echo "Installed $COMMAND_NAME -> $TARGET"
echo "Repository: $REPO_DIR"
echo "Run: $COMMAND_NAME"
