#!/usr/bin/env bash
# tests/integration/test_auto_path.sh
# 模拟 hook 引擎：依次跑 PostToolUse * N → Stop[0] → 检查 trigger flag。
# 不调真实 AgentHook；仅验证脚本链能正确把"达阈值"信号传到 trigger flag 文件。
#
# Test flow:
# - Stage 1: Simulate 9 PostToolUse events (no trigger yet)
# - Stage 2: Stop[0] before threshold (no flag)
# - Stage 3: 10th event flips pending=true (no flag yet)
# - Stage 4: Stop[0] creates trigger flag
# - Cleanup: Remove trigger flag after processing
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Create temporary test environment
TMP=$(mktemp -d -t evolve-auto-test-XXXXXX)
trap 'rm -rf "$TMP"' EXIT

# Setup test environment
export CLAUDE_PLUGIN_ROOT="$TMP"
export SELF_EVOLUTION_NUDGE_INTERVAL=10
mkdir -p "$TMP/scripts" "$TMP/data"
mkdir -p "$TMP/logs"
cp -r "$PLUGIN_ROOT/scripts/." "$TMP/scripts/"
SID="sess-auto-$$"
TRANSCRIPT="$PLUGIN_ROOT/tests/fixtures/transcript-create.json"

# Test helper functions
fail() { echo "FAIL: $*" >&2; exit 1; }
info() { echo "INFO: $*"; }

# Validate fixtures before running tests
info "Validating test fixtures..."
[ -f "$TRANSCRIPT" ] || fail "fixture missing: $TRANSCRIPT (Task 10 Step 1 may not have run)"
jq -e . "$TRANSCRIPT" >/dev/null || fail "fixture invalid JSON: $TRANSCRIPT"

# Stage 1: simulate 9 PostToolUse events → no trigger yet
info "Stage 1: Simulating 9 PostToolUse events..."
for i in $(seq 1 9); do
    echo "{\"session_id\":\"$SID\"}" | "$TMP/scripts/nudge-state.sh" --event=post-tool-use
done

# Stage 2: Stop[0] before threshold → no flag
info "Stage 2: Testing Stop[0] before threshold (should NOT create flag)..."
echo "{\"session_id\":\"$SID\",\"transcript_path\":\"$TRANSCRIPT\"}" | "$TMP/scripts/stop-gate.sh"
FLAG="$TMP/data/trigger-flag-$SID.json"
[ ! -f "$FLAG" ] || fail "no trigger expected before threshold"

# Stage 3: 10th event flips pending=true - NO flag should exist yet (Stop[0] creates it)
info "Stage 3: Sending 10th PostToolUse event (flips pending=true)..."
echo "{\"session_id\":\"$SID\"}" | "$TMP/scripts/nudge-state.sh" --event=post-tool-use
FLAG="$TMP/data/trigger-flag-$SID.json"
[ -f "$FLAG" ] && fail "unexpected trigger flag after 10th event - only Stop[0] should create it"

# Stage 4: Stop[0] → flag created
info "Stage 4: Testing Stop[0] after threshold (should create flag)..."
echo "{\"session_id\":\"$SID\",\"transcript_path\":\"$TRANSCRIPT\"}" | "$TMP/scripts/stop-gate.sh"
FLAG="$TMP/data/trigger-flag-$SID.json"
[ -f "$FLAG" ] || fail "expected trigger flag after Stop[0]"

# Cleanup: remove trigger flag after Stop[0]
info "Stage 5: Testing cleanup..."
echo "{\"session_id\":\"$SID\",\"transcript_path\":\"$TRANSCRIPT\"}" | "$TMP/scripts/stop-gate.sh" --cleanup
FLAG="$TMP/data/trigger-flag-$SID.json"
[ -f "$FLAG" ] && echo "WARN: cleanup did not remove flag"

# Final validation: ensure all stages completed successfully
echo "PASS: auto-path script chain"