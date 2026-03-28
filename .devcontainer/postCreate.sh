#!/bin/sh

set -eu

MAGICMIRROR_PATH="/opt/magic_mirror"
MODULE_DIR="$(pwd)"
MODULE_NAME="$(basename \"$MODULE_DIR\")"

# Note: Symlinks are now created in entrypoint.sh before the .env is loaded,
# ensuring they exist during container startup. This postCreate.sh only copies
# template files if they don't exist yet.

mkdir -p /tmp/playwright-mcp

if command -v playwright-mcp >/dev/null 2>&1; then
	playwright-mcp --version >/dev/null 2>&1 || true
fi