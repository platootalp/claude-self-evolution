#!/usr/bin/env bash
# tests/unit/test_stop_gate.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TMP=$(mktemp -d -t evolve-gate-test-XXXXXX)
trap 'rm -rf "$TMP"' EXIT

export CLAUDE_PLUGIN_ROOT="$TMP"
export SELF_EVOLUTION_NUDGE_INTERVAL=2
mkdir -p "$TMP/data"
mkdir -p "$TMP/scripts"
# Copy scripts so stop-gate.sh can find nudge-state.sh
cp -r "$PLUGIN_ROOT/scripts"/* "$TMP/scripts/"
SID="sess-gate-$$"
TRANSCRIPT="$TMP/transcript.json"
echo '[]' > "$TRANSCRIPT"

fail() { echo "FAIL: $*" >&2; exit 1; }

# Pre-condition: pending=true via 2 events
for i in 1 2; do
    echo "{\"session_id\":\"$SID\"}" | "$TMP/scripts/nudge-state.sh" --event=post-tool-use
done

# Test 1: stop-gate consumes pending and writes trigger flag
HOOK_PAYLOAD="{\"session_id\":\"$SID\",\"transcript_path\":\"$TRANSCRIPT\"}"
echo "$HOOK_PAYLOAD" | "$TMP/scripts/stop-gate.sh"
FLAG="$TMP/data/trigger-flag-$SID.json"
[ -f "$FLAG" ] || fail "expected trigger flag at $FLAG"
jq -e --arg t "$TRANSCRIPT" '.transcript_path == $t' "$FLAG" > /dev/null \
    || fail "trigger flag missing transcript_path"

# Test 2: --cleanup removes flag
echo "$HOOK_PAYLOAD" | "$TMP/scripts/stop-gate.sh" --cleanup
[ ! -f "$FLAG" ] || fail "expected trigger flag removed after --cleanup"

# Test 3: stop-gate without pending does NOT write flag
echo "$HOOK_PAYLOAD" | "$TMP/scripts/stop-gate.sh"
[ ! -f "$FLAG" ] || fail "expected no flag when pending=false, but file exists"

# Test 4: --cleanup is idempotent (no error when flag absent)
echo "$HOOK_PAYLOAD" | "$TMP/scripts/stop-gate.sh" --cleanup

# Test 5 (F44): transcript_path 缺失时不写 flag（即使 pending=true）
SID5="sess-no-transcript-$$"
for i in 1 2; do
    echo "{\"session_id\":\"$SID5\"}" | "$TMP/scripts/nudge-state.sh" --event=post-tool-use
done
NO_TRANSCRIPT_PAYLOAD="{\"session_id\":\"$SID5\"}"   # transcript_path 字段缺失
echo "$NO_TRANSCRIPT_PAYLOAD" | "$TMP/scripts/stop-gate.sh"
FLAG5="$TMP/data/trigger-flag-$SID5.json"
[ ! -f "$FLAG5" ] || fail "F44: missing transcript_path should NOT write trigger flag"

echo "PASS: stop-gate.sh"
