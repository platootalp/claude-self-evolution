#!/usr/bin/env bash
# tests/unit/test_verify_skill_quality.sh — Unit tests for verify-skill-quality.sh
#
# Tests the quality checklist verification script with valid and invalid fixtures.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERIFY_SCRIPT="$TEST_ROOT/scripts/verify-skill-quality.sh"

PASS=0
FAIL=0

log_pass() { echo "  PASS: $*"; PASS=$((PASS + 1)); }
log_fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }

echo "=========================================="
echo "  verify-skill-quality.sh Unit Tests"
echo "=========================================="
echo ""

# Test 1: Valid skill should pass
echo "[1/5] Valid skill fixture"
if "$VERIFY_SCRIPT" "$TEST_ROOT/tests/fixtures/skills/debug-fastapi-5xx/SKILL.md" > /dev/null 2>&1; then
    log_pass "Valid skill passes all checks"
else
    log_fail "Valid skill should have passed"
fi
echo ""

# Test 2: Valid skill in strict mode should also pass
echo "[2/5] Valid skill in strict mode"
if "$VERIFY_SCRIPT" "$TEST_ROOT/tests/fixtures/skills/debug-fastapi-5xx/SKILL.md" --strict > /dev/null 2>&1; then
    log_pass "Valid skill passes in strict mode"
else
    log_fail "Valid skill should have passed in strict mode"
fi
echo ""

# Test 3: Missing file should fail with exit 1
echo "[3/5] Missing file"
if "$VERIFY_SCRIPT" "/nonexistent/skill.md" > /dev/null 2>&1; then
    log_fail "Missing file should have failed"
else
    EXIT_CODE=$?
    if [ "$EXIT_CODE" -eq 1 ]; then
        log_pass "Missing file returns exit code 1"
    else
        log_fail "Missing file returned exit code $EXIT_CODE instead of 1"
    fi
fi
echo ""

# Test 4: No arguments should fail with exit 1
echo "[4/5] No arguments"
if "$VERIFY_SCRIPT" > /dev/null 2>&1; then
    log_fail "No args should have failed"
else
    EXIT_CODE=$?
    if [ "$EXIT_CODE" -eq 1 ]; then
        log_pass "No arguments returns exit code 1"
    else
        log_fail "No arguments returned exit code $EXIT_CODE instead of 1"
    fi
fi
echo ""

# Test 5: Unknown option should fail with exit 1
echo "[5/5] Unknown option"
if "$VERIFY_SCRIPT" "$TEST_ROOT/tests/fixtures/skills/debug-fastapi-5xx/SKILL.md" --unknown > /dev/null 2>&1; then
    log_fail "Unknown option should have failed"
else
    EXIT_CODE=$?
    if [ "$EXIT_CODE" -eq 1 ]; then
        log_pass "Unknown option returns exit code 1"
    else
        log_fail "Unknown option returned exit code $EXIT_CODE instead of 1"
    fi
fi
echo ""

# Summary
echo "=========================================="
echo "  Summary"
echo "=========================================="
echo "Passed: $PASS"
echo "Failed: $FAIL"

if [ "$FAIL" -eq 0 ]; then
    echo "All unit tests passed!"
    exit 0
else
    echo "Some tests failed."
    exit 1
fi
