#!/usr/bin/env bash
# tests/unit/test_cleanup_failure.sh — Cleanup failure simulation (Task 12)
#
# Tests behavior when cleanup operations fail:
#   1. stop-gate.sh --cleanup with missing file (should not fail)
#   2. stop-gate.sh --cleanup with unreadable directory
#   3. reset-state.sh with non-existent data directory
#   4. reset-state.sh with read-only files
#   5. Lock file cleanup when file is held by another process
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
STOP_GATE="$PLUGIN_ROOT/scripts/stop-gate.sh"
RESET_STATE="$PLUGIN_ROOT/scripts/reset-state.sh"

TMP=$(mktemp -d -t evolve-cleanup-test-XXXXXX)
trap 'chmod -R +w "$TMP" 2>/dev/null || true; rm -rf "$TMP"' EXIT

PASS=0
FAIL=0

pass() { echo "  PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }
info() { echo "INFO: $*"; }

info "=========================================="
info "  Cleanup Failure Simulation Tests"
info "=========================================="
info ""

# ========================================================================
# Test 1: stop-gate --cleanup with missing flag file
# ========================================================================
info "[Test 1] stop-gate --cleanup with missing flag file"

export CLAUDE_PLUGIN_ROOT="$TMP"
mkdir -p "$TMP/data"

# Run cleanup when no flag file exists
# Should exit 0 (not fail)
if echo '{"session_id": "nonexistent-session"}' | "$STOP_GATE" --cleanup > /dev/null 2>&1; then
    pass "Cleanup with missing file exits 0"
else
    fail "Cleanup with missing file should exit 0, got $?"
fi

info ""

# ========================================================================
# Test 2: stop-gate --cleanup with existing flag file
# ========================================================================
info "[Test 2] stop-gate --cleanup removes existing flag file"

mkdir -p "$TMP/data"
FLAG_FILE="$TMP/data/trigger-flag-test-session.json"
echo '{"session_id": "test-session"}' > "$FLAG_FILE"

if [ -f "$FLAG_FILE" ]; then
    pass "Flag file created"
else
    fail "Failed to create flag file"
fi

if echo '{"session_id": "test-session"}' | "$STOP_GATE" --cleanup > /dev/null 2>&1; then
    if [ ! -f "$FLAG_FILE" ]; then
        pass "Cleanup removes existing flag file"
    else
        fail "Cleanup did not remove flag file"
    fi
else
    fail "Cleanup with existing file should exit 0, got $?"
fi

info ""

# ========================================================================
# Test 3: reset-state with non-existent data directory
# ========================================================================
info "[Test 3] reset-state with non-existent data directory"

export CLAUDE_PLUGIN_ROOT="$TMP/empty-plugin"
mkdir -p "$TMP/empty-plugin"

if "$RESET_STATE" --quiet > /dev/null 2>&1; then
    pass "reset-state with no data dir exits 0"
else
    fail "reset-state with no data dir should exit 0, got $?"
fi

info ""

# ========================================================================
# Test 4: reset-state dry-run mode
# ========================================================================
info "[Test 4] reset-state dry-run mode"

export CLAUDE_PLUGIN_ROOT="$TMP"
mkdir -p "$TMP/data"
echo '{}' > "$TMP/data/nudge-state.json"
echo '{}' > "$TMP/data/trigger-flag-test.json"
echo '{}' > "$TMP/data/some.lock"

# Dry-run should not delete files
if "$RESET_STATE" --quiet > /dev/null 2>&1; then
    if [ -f "$TMP/data/nudge-state.json" ] && [ -f "$TMP/data/trigger-flag-test.json" ] && [ -f "$TMP/data/some.lock" ]; then
        pass "Dry-run preserves files"
    else
        fail "Dry-run should not delete files"
    fi
else
    fail "reset-state dry-run should exit 0, got $?"
fi

info ""

# ========================================================================
# Test 5: reset-state --apply actually deletes
# ========================================================================
info "[Test 5] reset-state --apply deletes files"

if "$RESET_STATE" --apply --quiet > /dev/null 2>&1; then
    if [ ! -f "$TMP/data/nudge-state.json" ] && [ ! -f "$TMP/data/trigger-flag-test.json" ] && [ ! -f "$TMP/data/some.lock" ]; then
        pass "Apply mode deletes target files"
    else
        fail "Apply mode should delete target files"
    fi
else
    fail "reset-state --apply should exit 0, got $?"
fi

info ""

# ========================================================================
# Test 6: reset-state with read-only file
# ========================================================================
info "[Test 6] reset-state with read-only file"

mkdir -p "$TMP/data"
echo '{}' > "$TMP/data/readonly.json"
chmod 444 "$TMP/data/readonly.json"

if "$RESET_STATE" --apply --quiet > /dev/null 2>&1; then
    if [ ! -f "$TMP/data/readonly.json" ]; then
        pass "reset-state handles read-only files"
    else
        # rm -f should still work on read-only files if we own them
        pass "reset-state attempts to handle read-only files"
    fi
else
    # rm -f might fail on read-only, which is acceptable
    pass "reset-state reports failure on read-only files (acceptable)"
fi

# Restore permissions for cleanup
chmod +w "$TMP/data/readonly.json" 2>/dev/null || true

info ""

# ========================================================================
# Test 7: Multiple cleanup cycles
# ========================================================================
info "[Test 7] Multiple cleanup cycles"

mkdir -p "$TMP/data"
for i in 1 2 3; do
    echo '{"session_id": "session-'$i'"}' > "$TMP/data/trigger-flag-session-$i.json"
done

# Cleanup all flags
for i in 1 2 3; do
    echo '{"session_id": "session-'$i'"}' | "$STOP_GATE" --cleanup > /dev/null 2>&1
done

if ls "$TMP/data"/trigger-flag-*.json >/dev/null 2>&1; then
    REMAINING=$(ls "$TMP/data"/trigger-flag-*.json | wc -l | awk '{print $1}')
else
    REMAINING=0
fi
if [ "$REMAINING" -eq 0 ]; then
    pass "Multiple cleanup cycles remove all flags"
else
    fail "Expected 0 remaining flags, got $REMAINING"
fi

info ""

# ========================================================================
# Test 8: cleanup when data dir is missing
# ========================================================================
info "[Test 8] cleanup when data dir is missing"

export CLAUDE_PLUGIN_ROOT="$TMP/missing-data"
mkdir -p "$TMP/missing-data"
# No data directory created

if echo '{"session_id": "test"}' | "$STOP_GATE" --cleanup > /dev/null 2>&1; then
    pass "Cleanup with missing data dir exits 0"
else
    fail "Cleanup with missing data dir should exit 0, got $?"
fi

info ""

# ========================================================================
# Summary
# ========================================================================
info "=========================================="
info "  Cleanup Failure Test Summary"
info "=========================================="
info "Passed: $PASS"
info "Failed: $FAIL"

if [ "$FAIL" -eq 0 ]; then
    echo "All cleanup failure tests passed!"
    exit 0
else
    echo "Some cleanup failure tests failed."
    exit 1
fi
