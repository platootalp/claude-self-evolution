#!/usr/bin/env bash
# scripts/security-scan.sh
# 全局 PreToolUse hook：拦截 Write/Edit/MultiEdit。
set -euo pipefail

# F31: 环境变量临时禁用扫描
if [ "${DISABLE_SELF_EVOLUTION_PREHOOK:-0}" = "1" ]; then
    cat > /dev/null
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/log.sh"

HOOK_INPUT=$(cat)
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // .toolName // empty')
TOOL_INPUT=$(echo "$HOOK_INPUT" | jq -c '.tool_input // .toolInput // {}')
TARGET=$(echo "$TOOL_INPUT" | jq -r '.file_path // .path // empty')

block() {
    local reason="$1"
    local log_dir="${SELF_EVOLUTION_LOG_DIR:-$HOME/.claude/logs}"
    local log_file="$log_dir/self-evolution.jsonl"
    mkdir -p "$log_dir" 2>/dev/null || true
    {
        jq -nc \
            --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --arg lvl warn \
            --arg ev scan_block \
            --arg reason "$reason" \
            --arg target "$TARGET" \
            --arg tool "$TOOL_NAME" \
            --arg pid "$$" \
            '{ts:$ts, level:$lvl, event:$ev, pid:($pid|tonumber), reason:$reason, target:$target, tool:$tool}' 2>/dev/null || true
    } >> "$log_file" 2>/dev/null || true
    echo "BLOCKED: $reason" >&2
    exit 2
}

# Path whitelist
case "$TARGET" in
    "$HOME"/.claude/skills/*/SKILL.md) ;;
    *)
        case "$TARGET" in
            "$HOME"/.claude/*)
                block "path_escape: write to ~/.claude/ outside skills/<name>/SKILL.md"
                ;;
            *)
                exit 0
                ;;
        esac
        ;;
esac

# Extract content
case "$TOOL_NAME" in
    Write)
        CONTENT=$(echo "$TOOL_INPUT" | jq -r '.content // empty')
        ;;
    Edit|MultiEdit)
        CONTENT=$(echo "$TOOL_INPUT" | jq -r '[.old_string, .new_string, (.edits[]?.new_string // empty)] | join("\n")')
        ;;
    *)
        exit 0
        ;;
esac

TMP=$(mktemp -t evolve-scan-XXXXXX)
trap 'rm -f "$TMP" "$TMP.decoded"' EXIT
printf '%s' "$CONTENT" > "$TMP"

# Patterns
PI_PATTERN='(ignore previous|disregard above|<\|im_start\|>|system:.*you are now|dump.*database|forget.*instructions)'
BASH_PATTERN='rm -rf /( |$)|curl[^|]*\| *(ba)?sh|eval[[:space:]]+\$\(|wget[^|]*-O[[:space:]]*-'
SECRET_PATTERN='(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----|ghp_[A-Za-z0-9]{36})'

# 1. Prompt injection (raw)
grep -qiE "$PI_PATTERN" "$TMP" && block "prompt-injection pattern"

# 2. Dangerous bash (raw)
grep -qE "$BASH_PATTERN" "$TMP" && block "dangerous bash pattern"

# 3. Secret leak (raw)
grep -qE "$SECRET_PATTERN" "$TMP" && block "secret leak pattern"

# 4. Base64 decoded scan (F1, F33, F34)
if command -v base64 >/dev/null 2>&1; then
    DECODED_OUT="$TMP.decoded"
    : > "$DECODED_OUT"
    MAX_TOKENS=50
    DECODE_CMD='
        grep -oE "[A-Za-z0-9+/]{20,}={0,2}" "$1" 2>/dev/null | head -n "$2" |
        while IFS= read -r token; do
            decoded=$(echo "$token" | base64 -d 2>/dev/null || echo "$token" | base64 -D 2>/dev/null) || continue
            len_total=${#decoded}
            [ "$len_total" -lt 4 ] && continue
            len_print=$(printf "%s" "$decoded" | tr -dc "[:print:]\t\n" | wc -c | tr -d "[:space:]")
            if [ "$((len_print * 100))" -ge "$((len_total * 80))" ]; then
                printf "%s\n" "$decoded"
            fi
        done
    '
    if command -v timeout >/dev/null 2>&1; then
        timeout 5s sh -c "$DECODE_CMD" _ "$TMP" "$MAX_TOKENS" >> "$DECODED_OUT" 2>/dev/null || true
    elif command -v gtimeout >/dev/null 2>&1; then
        gtimeout 5s sh -c "$DECODE_CMD" _ "$TMP" "$MAX_TOKENS" >> "$DECODED_OUT" 2>/dev/null || true
    else
        sh -c "$DECODE_CMD" _ "$TMP" "$MAX_TOKENS" >> "$DECODED_OUT" 2>/dev/null || true
    fi
    if [ -s "$DECODED_OUT" ]; then
        grep -qiE "$PI_PATTERN"     "$DECODED_OUT" && block "prompt-injection pattern (base64-decoded)"
        grep -qE  "$BASH_PATTERN"   "$DECODED_OUT" && block "dangerous bash pattern (base64-decoded)"
        grep -qE  "$SECRET_PATTERN" "$DECODED_OUT" && block "secret leak pattern (base64-decoded)"
    fi
fi

# 5. Size limit
SIZE=$(wc -c < "$TMP")
MAX_SIZE="${SELF_EVOLUTION_MAX_SKILL_SIZE:-15360}"
[ "$SIZE" -gt "$MAX_SIZE" ] && block "file too large ($SIZE > $MAX_SIZE bytes)"

exit 0
