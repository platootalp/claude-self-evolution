#!/usr/bin/env bash
# scripts/package.sh — Create platform-specific plugin packages
set -euo pipefail

VERSION=$(node -e "console.log(require('./.claude-plugin/plugin.json').version)")
DIST_DIR="dist-packages"
BASE_NAME="self-evolution"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

for PLATFORM in claude-code codex cursor; do
  case "$PLATFORM" in
    claude-code) MANIFEST_DIR=".claude-plugin"; HOOKS_FILE="hooks/hooks.json" ;;
    codex)       MANIFEST_DIR=".codex-plugin"; HOOKS_FILE="hooks/hooks.codex.json" ;;
    cursor)      MANIFEST_DIR=".cursor-plugin"; HOOKS_FILE="hooks/hooks.cursor.json" ;;
  esac

  PKG_DIR="$DIST_DIR/${BASE_NAME}-${PLATFORM}-${VERSION}"
  mkdir -p "$PKG_DIR"

  # Copy runtime
  cp -r dist/ "$PKG_DIR/dist/"

  # Copy manifest
  cp -r "$MANIFEST_DIR" "$PKG_DIR/$MANIFEST_DIR"

  # Copy hooks
  mkdir -p "$PKG_DIR/hooks"
  cp "$HOOKS_FILE" "$PKG_DIR/$(basename "$HOOKS_FILE")"

  # Copy shared components
  cp -r agents/ "$PKG_DIR/agents/"
  cp -r commands/ "$PKG_DIR/commands/"
  cp -r skills/ "$PKG_DIR/skills/"
  cp -r prompts/ "$PKG_DIR/prompts/"

  # Create tarball
  tar -czf "$DIST_DIR/${BASE_NAME}-${PLATFORM}-${VERSION}.tar.gz" -C "$DIST_DIR" "${BASE_NAME}-${PLATFORM}-${VERSION}"

  echo "Packaged: ${BASE_NAME}-${PLATFORM}-${VERSION}.tar.gz"
done

echo "All packages created in $DIST_DIR/"