#!/usr/bin/env bash
# scripts/reset-state.sh
# 清理 self-evolution 运行时状态：nudge-state.json / trigger-flag-*.json
# 不删除生成的 ~/.claude/skills/<...>/ 已生成 skill（用户主动管理）
# Usage:
#   reset-state.sh                  # 仅显示要删除的文件，不实际删
#   reset-state.sh --apply          # 实际执行删除
#   reset-state.sh --apply --quiet  # 静默模式（脚本化场景）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/log.sh
. "$SCRIPT_DIR/lib/log.sh"

PLUGIN_DIR="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/self-evolution}"
DATA_DIR="$PLUGIN_DIR/data"

APPLY=0; QUIET=0
for arg in "$@"; do
    case "$arg" in
        --apply) APPLY=1 ;;
        --quiet) QUIET=1 ;;
        -h|--help)
            sed -n '2,10p' "$0"; exit 0 ;;
        *) echo "Unknown arg: $arg" >&2; exit 1 ;;
    esac
done

[ -d "$DATA_DIR" ] || { [ "$QUIET" = "0" ] && echo "No data dir at $DATA_DIR; nothing to reset."; exit 0; }

TARGETS=($(find "$DATA_DIR" -maxdepth 1 -type f \
    \( -name 'nudge-state.json' -o -name 'trigger-flag-*.json' -o -name '*.lock' \) 2>/dev/null))

if [ "${#TARGETS[@]}" -eq 0 ]; then
    [ "$QUIET" = "0" ] && echo "Nothing to reset in $DATA_DIR."
    exit 0
fi

if [ "$QUIET" = "0" ]; then
    echo "Targets:"
    printf '  %s\n' "${TARGETS[@]}"
fi

if [ "$APPLY" -eq 1 ]; then
    rm -f "${TARGETS[@]}"
    log_event info reset_state \
        "$(jq -nc --argjson n "${#TARGETS[@]}" '{deleted_count:$n}')"
    [ "$QUIET" = "0" ] && echo "Removed ${#TARGETS[@]} file(s)."
else
    [ "$QUIET" = "0" ] && echo "(dry run) re-run with --apply to delete."
fi