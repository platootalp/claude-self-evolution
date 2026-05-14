#!/bin/bash
# Preflight checks for self-evolution plugin

set -e

# Check Node.js version (requires >= 18)
node_version=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$node_version" -lt 18 ]; then
  echo "Error: Node.js >= 18 required, found v$(node -v)"
  exit 1
fi

# Check runtime exists
if [ ! -f "dist/runtime.mjs" ]; then
  echo "Error: dist/runtime.mjs not found. Run 'npm run build' first."
  exit 1
fi

echo "Preflight checks passed"
