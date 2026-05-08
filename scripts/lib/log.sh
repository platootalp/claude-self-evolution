#!/usr/bin/env bash
# scripts/lib/log.sh
# 统一的事件日志 helper：被 security-scan.sh / posix-lock.sh / reset-state.sh source。
# 写入 ~/.claude/logs/self-evolution.jsonl，每行一个 JSON 对象。
# Usage (sourced):
#   log_event <level> <event> <kv-json-fragment>

LOG_DIR="${SELF_EVOLUTION_LOG_DIR:-$HOME/.claude/logs}"
LOG_FILE="$LOG_DIR/self-evolution.jsonl"

log_event() {
    local level="$1" event="$2" kv="${3:-{}}"
    if ! mkdir -p "$LOG_DIR" 2>/dev/null; then
        return 0
    fi
    jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg lvl "$level" --arg ev "$event" --argjson kv "$kv" --arg pid "$$" '{ts:$ts, level:$lvl, event:$ev, pid:($pid|tonumber)} + $kv' >> "$LOG_FILE" 2>/dev/null || true
}

log_decision() {
    local decision="${1:-unknown}" detail="${2:-}" dur_ms="${3:-0}" sid="${4:-}"
    case "$dur_ms" in
        ''|*[!0-9]*) dur_ms=0 ;;
    esac
    if ! mkdir -p "$LOG_DIR" 2>/dev/null; then
        return 0
    fi
    jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg lvl info --arg ev reviewer_decision --arg d "$decision" --arg r "$detail" --arg s "$sid" --argjson ms "$dur_ms" --arg pid "$$" '{ts:$ts, level:$lvl, event:$ev, decision:$d, detail:$r, session_id:$s, duration_ms:$ms, pid:($pid|tonumber)}' >> "$LOG_FILE" 2>/dev/null || true
}
