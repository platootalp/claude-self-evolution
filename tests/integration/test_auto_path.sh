#!/usr/bin/env bash
# tests/integration/test_auto_path.sh
# 模拟 hook engine：依次跑 PostToolUse * N → Stop[0] → 检查 trigger flag。
# 不调真实 AgentHook；仅验证脚本链能正确把"达阈值"信号传到 trigger flag 文件。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TMP=$(mktemp -d -t evolve-auto-test-XXXXXX)
trap 'rm -rf "$TMP"' EXIT

export CLAUDE_PLUGIN_ROOT="$TMP"
export SELF_EVOLUTION_NUDGE_INTERVAL=10
mkdir -p "$TMP/scripts" "$TMP/data"
mkdir -p "$TMP/logs"
cp -r "$PLUGIN_ROOT/scripts/." "$TMP/scripts/"
SID="sess-auto-$$"
TRANSCRIPT="$PLUGIN_ROOT/tests/fixtures/transcript-create.json"

fail() { echo "FAIL: $*" >&2; exit 1; }
info() { echo "INFO: $*"; }

# F22: precondition — fixtures must exist and be valid JSON
[ -f "$TRANSCRIPT" ] || fail "fixture missing: $TRANSCRIPT (Task 10 Step 1 may not have run)"
jq -e . "$TRANSCRIPT" >/dev/null || fail "fixture invalid JSON: $TRANSCRIPT"

# Stage 1: simulate 9 PostToolUse events → no trigger yet
for i in $(seq 1 9); do
    echo "{\"session_id\":\"$SID\"}" | "$TMP/scripts/nudge-state.sh" --event=post-tool-use
done

# Stage 2: Stop[0] before threshold → no flag
echo "{\"session_id\":\"$SID\",\"transcript_path\":\"$TRANSCRIPT\"}" | "$TMP/scripts/stop-gate.sh"
FLAG="$TMP/data/trigger-flag-$SID.json"
[ ! -f "$FLAG" ] || fail "no trigger expected before threshold"

# Stage 3: 10th event flips pending=true
echo "{\"session_id\":\"$SID\"}" | "$TMP/scripts/nudge-state.sh" --event=post-tool-use
FLAG="$TMP/data/trigger-flag-$SID.json"
[ ! -f "$FLAG" ] || fail "expected trigger after 10th event"

# Stage 4: Stop[0] → flag created
echo "{\"session_id\":\"$SID\",\"transcript_path\":\"$TRANSCRIPT\"}" | "$TMP/scripts/stop-gate.sh"
FLAG="$TMP/data/trigger-flag-$SID.json"
[ -f "$FLAG" ] || fail "expected trigger flag after Stop[0]"

# Cleanup
echo "{\"session_id\":\"$SID\",\"transcript_path\":\"$TRANSCRIPT\"}" | "$TMP/scripts/stop-gate.sh" --cleanup
[ ! -f "$FLAG" ] && echo "WARN: cleanup did not remove flag"

echo "PASS: auto-path script chain"
