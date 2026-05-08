#!/usr/bin/env bash
# tests/unit/test_nudge_state.sh
# 单元测试：nudge-state.sh 的计数 / 阈值 / 并发写
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NUDGE="$PLUGIN_ROOT/scripts/nudge-state.sh"

TMP=$(mktemp -d -t evolve-nudge-test-XXXXXX)
trap 'rm -rf "$TMP"' EXIT

export CLAUDE_PLUGIN_ROOT="$TMP"
export SELF_EVOLUTION_NUDGE_INTERVAL=3
mkdir -p "$TMP/data"

SID="sess-test-$$"

fail() { echo "FAIL: $*" >&2; exit 1; }

# Test 1: count increments per post-tool-use event
for i in 1 2; do
    echo "{\"session_id\":\"$SID\"}" | "$NUDGE" --event=post-tool-use
done
COUNT=$(jq -r --arg s "$SID" '.[$s].count' "$TMP/data/nudge-state.json")
[ "$COUNT" = "2" ] || fail "expected count=2 after 2 events, got $COUNT"

# Test 2: at threshold, count resets to 0 and pending_review=true
echo "{\"session_id\":\"$SID\"}" | "$NUDGE" --event=post-tool-use
COUNT=$(jq -r --arg s "$SID" '.[$s].count' "$TMP/data/nudge-state.json")
PEND=$(jq -r --arg s "$SID" '.[$s].pending_review' "$TMP/data/nudge-state.json")
[ "$COUNT" = "0" ] || fail "expected count=0 after threshold, got $COUNT"
[ "$PEND" = "true" ] || fail "expected pending_review=true, got $PEND"

# Test 3: consume-pending returns TRIGGER and clears pending
RESULT=$("$NUDGE" "$SID" consume-pending)
[ "$RESULT" = "TRIGGER" ] || fail "expected TRIGGER, got $RESULT"
PEND=$(jq -r --arg s "$SID" '.[$s].pending_review' "$TMP/data/nudge-state.json")
[ "$PEND" = "false" ] || fail "expected pending_review=false after consume, got $PEND"

# Test 4: consume-pending without pending returns SKIP
RESULT=$("$NUDGE" "$SID" consume-pending)
[ "$RESULT" = "SKIP" ] || fail "expected SKIP, got $RESULT"

# Test 5: concurrent writers don't corrupt JSON
SID2="sess-concurrent-$$"
for i in $(seq 1 20); do
    (echo "{\"session_id\":\"$SID2\"}" | "$NUDGE" --event=post-tool-use) &
done
wait
jq -e . "$TMP/data/nudge-state.json" > /dev/null || fail "concurrent writes corrupted JSON"

echo "PASS: nudge-state.sh"
