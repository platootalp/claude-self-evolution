#!/usr/bin/env bash
# tests/real-world/verify-batch.sh — 批量验证真实环境测试生成的 skills
#
# Usage: verify-batch.sh [--strict]
#   --strict: 使用严格模式验证（任何质量 issue 都视为失败）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY_SCRIPT="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/self-evolution}/scripts/verify-skill-quality.sh"
STRICT_MODE=""

if [ "${1:-}" = "--strict" ]; then
    STRICT_MODE="--strict"
fi

PASS=0
FAIL=0
SKIP=0

echo "=========================================="
echo "  Batch Skill Verification"
echo "=========================================="
echo ""

# 检查 verify 脚本
if [ ! -x "$VERIFY_SCRIPT" ]; then
    echo "ERROR: verify-skill-quality.sh not found at $VERIFY_SCRIPT" >&2
    echo "Set CLAUDE_PLUGIN_ROOT or ensure plugin is installed." >&2
    exit 1
fi

# 检查 skills 目录
SKILLS_DIR="$HOME/.claude/skills"
if [ ! -d "$SKILLS_DIR" ]; then
    echo "WARNING: Skills directory not found at $SKILLS_DIR" >&2
    exit 0
fi

# 统计所有生成的 skills
SKILL_DIRS=$(find "$SKILLS_DIR" -maxdepth 1 -type d -name "[a-z]*-[a-z]*" 2>/dev/null | sort || true)

if [ -z "$SKILL_DIRS" ]; then
    echo "No skills found in $SKILLS_DIR"
    exit 0
fi

TOTAL=$(echo "$SKILL_DIRS" | wc -l | tr -d ' ')
echo "Found $TOTAL skill directories to verify:"
echo ""

# 逐个验证
while read -r skill_dir; do
    [ -n "$skill_dir" ] || continue

    name=$(basename "$skill_dir")
    skill_file="$skill_dir/SKILL.md"

    printf "  %-40s " "$name"

    if [ ! -f "$skill_file" ]; then
        echo "[MISSING SKILL.MD]"
        FAIL=$((FAIL + 1))
        continue
    fi

    # 运行验证
    set +e
    OUTPUT=$("$VERIFY_SCRIPT" "$skill_file" $STRICT_MODE 2>&1)
    EXIT_CODE=$?
    set -e

    case "$EXIT_CODE" in
        0)
            echo "[PASS]"
            PASS=$((PASS + 1))
            ;;
        2)
            if [ -n "$STRICT_MODE" ]; then
                echo "[FAIL - quality issues in strict mode]"
                FAIL=$((FAIL + 1))
            else
                echo "[PASS - minor quality issues]"
                PASS=$((PASS + 1))
            fi
            ;;
        3)
            echo "[FAIL - SECURITY VIOLATION]"
            FAIL=$((FAIL + 1))
            ;;
        *)
            echo "[FAIL - exit code $EXIT_CODE]"
            FAIL=$((FAIL + 1))
            ;;
    esac
done <<< "$SKILL_DIRS"

echo ""
echo "=========================================="
echo "  Verification Summary"
echo "=========================================="
echo "Total:   $TOTAL"
echo "Passed:  $PASS"
echo "Failed:  $FAIL"
echo ""

# 显示决策日志摘要
echo "Recent decision log:"
if [ -f "$HOME/.claude/logs/self-evolution.jsonl" ]; then
    jq -r 'select(.event == "reviewer_decision") | "  \(.ts) | \(.decision) | \(.detail // "N/A")"' \
        "$HOME/.claude/logs/self-evolution.jsonl" 2>/dev/null | tail -10 || echo "  (no entries)"
else
    echo "  (log file not found)"
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
    echo "All skills passed verification!"
    exit 0
else
    echo "$FAIL skill(s) failed verification."
    exit 1
fi
