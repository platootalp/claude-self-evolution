#!/bin/bash
# End-to-end integration test for TS runtime
# Tests the runtime in headless mode with state.json

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNTIME="$ROOT_DIR/dist/runtime.mjs"
STATE_FILE="$ROOT_DIR/test-state.json"
LOG_FILE="$ROOT_DIR/test-log.jsonl"

cleanup() {
  rm -f "$STATE_FILE" "$LOG_FILE"
}
trap cleanup EXIT

# Precheck
if [ ! -f "$RUNTIME" ]; then
  echo "FAIL: runtime not built"
  exit 1
fi

# Test 1: session-start
echo "Testing session-start..."
CLAUDE_PLUGIN_DATA="$(mktemp -d)" node "$RUNTIME" session-start
echo "PASS: session-start"

# Test 2: post-tool-use
echo "Testing post-tool-use..."
echo '{"tool":"Write","duration_ms":150}' | CLAUDE_PLUGIN_DATA="$(mktemp -d)" node "$RUNTIME" post-tool-use
echo "PASS: post-tool-use"

# Test 3: security-scan
echo "Testing security-scan..."
result=$(node "$RUNTIME" security-scan --path test.ts --content "const x = 1")
echo "$result" | grep -q '"allowed":true' && echo "PASS: security-scan" || echo "FAIL: security-scan $result"

# Test 4: status
echo "Testing status..."
STATE_DIR="$(mktemp -d)" STATE_PATH="$STATE_FILE" SELF_EVOLUTION_LOG_DIR="$(mktemp -d)" node "$RUNTIME" status
echo "PASS: status"

# Test 5: review-context
echo "Testing review-context..."
TRANSCRIPT_PATH="$ROOT_DIR/tests/fixtures/transcript-create.json" node "$RUNTIME" review-context > /dev/null
echo "PASS: review-context"

echo ""
echo "All integration tests passed"
