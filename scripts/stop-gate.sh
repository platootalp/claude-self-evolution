#!/usr/bin/env bash
# scripts/stop-gate.sh
# Stop hook 前置门控：消费 nudge pending 标记，决定是否为 AgentHook 写 trigger flag。
# 第二次调用形态（--cleanup）由 Stop[2] 触发，清理 trigger flag。
set -euo pipefail

PLUGIN_DIR="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/self-evolution}"
DATA_DIR="$PLUGIN_DIR/data"
mkdir -p "$DATA_DIR"

HOOK_INPUT=$(cat)
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty')
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty')
FLAG_FILE="$DATA_DIR/trigger-flag-$SESSION_ID.json"

if [ "${1:-}" = "--cleanup" ]; then
    rm -f "$FLAG_FILE"
    exit 0
fi

[ -n "$SESSION_ID" ] || exit 0
# F44: transcript_path 必须非空，否则下游 reviewer 无法读取对话内容；缺失时静默 SKIP 而不是写空 flag。
[ -n "$TRANSCRIPT_PATH" ] || exit 0

DECISION=$("$PLUGIN_DIR/scripts/nudge-state.sh" "$SESSION_ID" consume-pending)
if [ "$DECISION" = "TRIGGER" ]; then
    jq -n \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg session "$SESSION_ID" \
        --arg transcript "$TRANSCRIPT_PATH" \
        '{ts: $ts, session_id: $session, transcript_path: $transcript}' \
        > "$FLAG_FILE"
fi

exit 0
