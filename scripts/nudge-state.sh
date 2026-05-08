#!/usr/bin/env bash
# scripts/nudge-state.sh
# PostToolUse 计数器 + Stop 前置消费器。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/posix-lock.sh"

PLUGIN_DIR="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/self-evolution}"
STATE_FILE="$PLUGIN_DIR/data/nudge-state.json"
LOCK_DIR="$STATE_FILE.lock"
THRESHOLD="${SELF_EVOLUTION_NUDGE_INTERVAL:-10}"

mkdir -p "$(dirname "$STATE_FILE")"
[ -f "$STATE_FILE" ] || echo '{}' > "$STATE_FILE"

if [[ "${1:-}" == --event=* ]]; then
    ACTION="${1#--event=}"
    HOOK_INPUT=$(cat)
    SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty')
else
    SESSION_ID="${1:?Usage: nudge-state.sh <session-id> consume-pending | --event=post-tool-use}"
    ACTION="${2:-consume-pending}"
fi

[ -n "$SESSION_ID" ] || exit 0

acquire_lock "$LOCK_DIR" 5
trap 'release_lock "$LOCK_DIR"' EXIT

case "$ACTION" in
    post-tool-use)
        CURRENT=$(jq -r --arg s "$SESSION_ID" '.[$s].count // 0' "$STATE_FILE")
        NEW=$((CURRENT + 1))
        if [ "$NEW" -ge "$THRESHOLD" ]; then
            jq --arg s "$SESSION_ID" '.[$s].count = 0 | .[$s].pending_review = true' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
        else
            jq --arg s "$SESSION_ID" --argjson n "$NEW" '.[$s].count = $n' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
        fi
        ;;
    consume-pending)
        PENDING=$(jq -r --arg s "$SESSION_ID" '.[$s].pending_review // false' "$STATE_FILE")
        if [ "$PENDING" = "true" ]; then
            jq --arg s "$SESSION_ID" '.[$s].pending_review = false' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
            echo "TRIGGER"
        else
            echo "SKIP"
        fi
        ;;
    *)
        echo "Unknown action: $ACTION" >&2; exit 1 ;;
esac
exit 0