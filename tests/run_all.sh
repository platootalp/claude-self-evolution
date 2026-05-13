#!/usr/bin/env bash
# tests/run_all.sh — 运行所有测试并提供清晰的通过/失败反馈
#
# 执行顺序：
#   1. preflight.sh（环境自检）
#   2. unit/test_nudge_state.sh
#   3. unit/test_stop_gate.sh
#   4. unit/test_security_scan.sh
#   5. unit/test_verify_skill_quality.sh（如存在）
#   6. unit/test_redteam_full.sh（如存在）
#   7. unit/test_cleanup_failure.sh（如存在）
#   8. integration/test_auto_path.sh（如存在）
#
# 无头 Claude 冒烟：见 docs/testing.md，单独运行
#   RUN_CLAUDE_E2E=1 ./tests/integration/test_headless_e2e.sh
#
# 输出要求：
#   - 每个测试显示名称和状态（PASS/FAIL）
#   - 失败时显示失败原因
#   - 最终汇总：总通过/失败数
#   - Exit 0 仅当全部通过
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_ROOT="$SCRIPT_DIR"
TOTAL_PASS=0
TOTAL_FAIL=0
FAILED_TESTS=()

# ANSI color codes for better visibility
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Header
echo "=========================================="
echo "  Self-Evolution Plugin Test Suite"
echo "=========================================="
echo ""

# Function to run a test and track results
run_test() {
    local test_path="$1"
    local test_name="$2"
    local output
    local exit_code
    local tmpfile

    printf "%-40s ... " "$test_name"

    # Capture output to a temporary file to avoid issues with large output
    tmpfile=$(mktemp)
    trap 'rm -f "$tmpfile"' RETURN

    if "$test_path" > "$tmpfile" 2>&1; then
        exit_code=0
    else
        exit_code=$?
    fi

    output=$(cat "$tmpfile" 2>/dev/null || echo "")

    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}PASS${NC}"
        TOTAL_PASS=$((TOTAL_PASS + 1))
    else
        echo -e "${RED}FAIL${NC}"
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
        FAILED_TESTS+=("$test_name")
        echo -e "${RED}Error output (first 50 lines):${NC}"
        echo "$output" | head -50 | sed 's/^/    /'
        if [ $(echo "$output" | wc -l) -gt 50 ]; then
            echo "    ... (output truncated, see full output above)"
        fi
    fi
    echo ""
}

# Run tests in the specified order

# 1. Preflight checks
if [ -x "$TEST_ROOT/preflight.sh" ]; then
    echo "[1/8] Preflight Environment Checks"
    echo "-----------------------------------"
    run_test "$TEST_ROOT/preflight.sh" "preflight.sh"
else
    echo -e "${YELLOW}WARNING${NC}: preflight.sh not found or not executable"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    FAILED_TESTS+=("preflight.sh (missing)")
    echo ""
fi

# 2. Unit tests
echo "[2/8] Unit Tests - Nudge State"
echo "-----------------------------------"
if [ -x "$TEST_ROOT/unit/test_nudge_state.sh" ]; then
    run_test "$TEST_ROOT/unit/test_nudge_state.sh" "unit/test_nudge_state.sh"
else
    echo -e "${YELLOW}WARNING${NC}: unit/test_nudge_state.sh not found or not executable"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    FAILED_TESTS+=("unit/test_nudge_state.sh (missing)")
    echo ""
fi

echo "[3/8] Unit Tests - Stop Gate"
echo "-----------------------------------"
if [ -x "$TEST_ROOT/unit/test_stop_gate.sh" ]; then
    run_test "$TEST_ROOT/unit/test_stop_gate.sh" "unit/test_stop_gate.sh"
else
    echo -e "${YELLOW}WARNING${NC}: unit/test_stop_gate.sh not found or not executable"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    FAILED_TESTS+=("unit/test_stop_gate.sh (missing)")
    echo ""
fi

echo "[4/8] Unit Tests - Security Scan"
echo "-----------------------------------"
if [ -x "$TEST_ROOT/unit/test_security_scan.sh" ]; then
    run_test "$TEST_ROOT/unit/test_security_scan.sh" "unit/test_security_scan.sh"
else
    echo -e "${YELLOW}WARNING${NC}: unit/test_security_scan.sh not found or not executable"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    FAILED_TESTS+=("unit/test_security_scan.sh (missing)")
    echo ""
fi

echo "[5/8] Unit Tests - Verify Skill Quality"
echo "-----------------------------------"
if [ -x "$TEST_ROOT/unit/test_verify_skill_quality.sh" ]; then
    run_test "$TEST_ROOT/unit/test_verify_skill_quality.sh" "unit/test_verify_skill_quality.sh"
else
    echo -e "${YELLOW}INFO${NC}: unit/test_verify_skill_quality.sh not found (optional)"
    echo ""
fi

echo "[6/8] Unit Tests - Redteam Full Suite"
echo "-----------------------------------"
if [ -x "$TEST_ROOT/unit/test_redteam_full.sh" ]; then
    run_test "$TEST_ROOT/unit/test_redteam_full.sh" "unit/test_redteam_full.sh"
else
    echo -e "${YELLOW}INFO${NC}: unit/test_redteam_full.sh not found (optional)"
    echo ""
fi

echo "[7/8] Unit Tests - Cleanup Failure"
echo "-----------------------------------"
if [ -x "$TEST_ROOT/unit/test_cleanup_failure.sh" ]; then
    run_test "$TEST_ROOT/unit/test_cleanup_failure.sh" "unit/test_cleanup_failure.sh"
else
    echo -e "${YELLOW}INFO${NC}: unit/test_cleanup_failure.sh not found (optional)"
    echo ""
fi

# 8. Integration tests
echo "[8/8] Integration Tests - Auto Path"
echo "-----------------------------------"
if [ -x "$TEST_ROOT/integration/test_auto_path.sh" ]; then
    run_test "$TEST_ROOT/integration/test_auto_path.sh" "integration/test_auto_path.sh"
else
    echo -e "${YELLOW}INFO${NC}: integration/test_auto_path.sh not found (optional)"
    echo ""
fi

# Final summary
echo "=========================================="
echo "  Test Summary"
echo "=========================================="
echo "Total Tests: $((TOTAL_PASS + TOTAL_FAIL))"
echo -e "${GREEN}Passed:${NC} $TOTAL_PASS"
echo -e "${RED}Failed:${NC} $TOTAL_FAIL"
echo ""

if [ $TOTAL_FAIL -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    echo "=========================================="
    exit 0
else
    echo -e "${RED}Failed tests:${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo "  - $test"
    done
    echo ""
    echo -e "${RED}Some tests failed. Please review the errors above.${NC}"
    echo "=========================================="
    exit 1
fi