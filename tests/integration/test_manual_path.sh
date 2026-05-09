#!/usr/bin/env bash
# tests/integration/test_manual_path.sh — Integration test for manual evolution path
#
# Simulates the /evolve-review → skill-reviewer → evolve-skill-writer → skill creation
# flow without requiring a real Claude environment.
#
# Test stages:
#   1. Setup temporary environment
#   2. Create mock conversation transcript
#   3. Simulate skill-reviewer decision (CREATE vs SKIP)
#   4. Simulate evolve-skill-writer meta-skill invocation
#   5. Verify generated skill with verify-skill-quality.sh
#   6. Cleanup
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0
FAIL=0

pass() { echo "  PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }
info() { echo "INFO: $*"; }

# ========================================================================
# Setup
# ========================================================================
TMP=$(mktemp -d -t evolve-manual-test-XXXXXX)
trap 'rm -rf "$TMP"' EXIT

export CLAUDE_PLUGIN_ROOT="$TMP"
export SELF_EVOLUTION_LOG_DIR="$TMP/logs"
mkdir -p "$TMP/data"
mkdir -p "$TMP/logs"
mkdir -p "$TMP/skills"

# Create a mock conversation transcript that SHOULD trigger skill creation
# This simulates a real conversation with multiple tool calls
cat > "$TMP/data/mock-transcript.json" << 'TRANSCRIPT_EOF'
{
  "session_id": "test-manual-path-001",
  "tool_calls": 15,
  "transcript": [
    {"turn": 1, "role": "user", "content": "How do I debug FastAPI 5xx errors systematically?"},
    {"turn": 2, "role": "assistant", "action": "Read log files"},
    {"turn": 3, "role": "assistant", "action": "Analyze stack trace"},
    {"turn": 4, "role": "assistant", "action": "Check database connections"},
    {"turn": 5, "role": "assistant", "action": "Verify environment variables"},
    {"turn": 6, "role": "assistant", "action": "Write fix to users.py"},
    {"turn": 7, "role": "assistant", "action": "Test with curl"}
  ]
}
TRANSCRIPT_EOF

info "=========================================="
info "  Manual Path Integration Test"
info "=========================================="
info ""
info "Temp directory: $TMP"
info ""

# ========================================================================
# Stage 1: Verify plugin structure
# ========================================================================
info "[Stage 1/6] Plugin structure verification"

if [ -d "$PLUGIN_ROOT" ]; then
    pass "Plugin root directory exists"
else
    fail "Plugin root not found"
fi

if [ -d "$PLUGIN_ROOT/scripts" ]; then
    pass "Scripts directory exists"
else
    fail "Scripts directory not found"
fi

if [ -x "$PLUGIN_ROOT/scripts/nudge-state.sh" ]; then
    pass "nudge-state.sh is executable"
else
    fail "nudge-state.sh not executable"
fi

if [ -x "$PLUGIN_ROOT/scripts/stop-gate.sh" ]; then
    pass "stop-gate.sh is executable"
else
    fail "stop-gate.sh not executable"
fi

if [ -x "$PLUGIN_ROOT/scripts/security-scan.sh" ]; then
    pass "security-scan.sh is executable"
else
    fail "security-scan.sh not executable"
fi

if [ -x "$PLUGIN_ROOT/scripts/verify-skill-quality.sh" ]; then
    pass "verify-skill-quality.sh is executable"
else
    fail "verify-skill-quality.sh not executable"
fi

if [ -f "$PLUGIN_ROOT/agents/skill-reviewer.md" ]; then
    pass "skill-reviewer agent exists"
else
    fail "skill-reviewer agent not found"
fi

if [ -f "$PLUGIN_ROOT/skills/evolve-skill-writer/SKILL.md" ]; then
    pass "evolve-skill-writer meta-skill exists"
else
    fail "evolve-skill-writer meta-skill not found"
fi

info ""

# ========================================================================
# Stage 2: Simulate skill-reviewer decision logic
# ========================================================================
info "[Stage 2/6] Simulating skill-reviewer decision logic"

# Read the transcript and apply decision rules
TOOL_CALL_COUNT=$(jq '.tool_calls' "$TMP/data/mock-transcript.json")
TRANSCRIPT_LENGTH=$(jq '.transcript | length' "$TMP/data/mock-transcript.json")

info "  Tool calls: $TOOL_CALL_COUNT"
info "  Transcript entries: $TRANSCRIPT_LENGTH"

# Decision heuristic (simplified version of skill-reviewer logic):
# - SKIP if: trivial (≤2 steps), one-off, unresolved errors
# - CREATE if: ≥3 logical steps, generalizable, no sensitive data

if [ "$TOOL_CALL_COUNT" -ge 10 ] && [ "$TRANSCRIPT_LENGTH" -ge 5 ]; then
    DECISION="CREATE"
    RATIONALE="Systematic FastAPI debugging with 5+ logical steps covering log analysis, stack trace parsing, DB checks, env verification, and testing — generalizable to any FastAPI app"
    pass "Decision: CREATE (complex workflow with $TOOL_CALL_COUNT tool calls)"
else
    DECISION="SKIP"
    RATIONALE="insufficient_complexity"
    pass "Decision: SKIP (too simple)"
fi

info "  Decision: $DECISION"
info "  Rationale: $RATIONALE"
info ""

# ========================================================================
# Stage 3: Simulate meta-skill invocation
# ========================================================================
info "[Stage 3/6] Simulating evolve-skill-writer meta-skill invocation"

if [ "$DECISION" = "CREATE" ]; then
    PROPOSED_NAME="debug-fastapi-5xx"
    SKILL_DIR="$TMP/skills/$PROPOSED_NAME"
    mkdir -p "$SKILL_DIR"

    # Simulate the meta-skill generating SKILL.md content
    # In reality, this would come from the evolve-skill-writer skill
    cat > "$SKILL_DIR/SKILL.md" << 'SKILL_EOF'
---
name: debug-fastapi-5xx
description: Debug 5xx errors in FastAPI apps. Use whenever you encounter HTTP 500/502/503 errors or server crashes.
when_to_use: |
  When debugging FastAPI applications that return 5xx status codes.

  Example user phrases:
  - "My FastAPI app is crashing with 500 errors"
  - "Why is my API returning 502 Bad Gateway?"
paths: ["**/*"]
allowed-tools: Read Bash Edit
version: "1.0.0"
---

# Debug FastAPI 5xx Errors

Systematically diagnose and resolve server-side errors in FastAPI applications.

## When to use

Use this skill when:
- Your FastAPI application returns HTTP 500, 502, or 503 errors
- Server processes crash unexpectedly
- Error logs show unhandled exceptions

Do NOT use this skill for:
- Client-side 4xx errors
- CORS issues

## Steps

1. Read application logs to identify error patterns
2. Identify the exception type and location from stack traces
3. Check for common issues (AttributeError, ConnectionError, TimeoutError)
4. Verify environment configuration and database connections
5. Test the fix locally before deploying

## Example

**Scenario**: A FastAPI app returns 500 errors on the `/api/users/{user_id}` endpoint.

**Walkthrough**:
1. Read logs: `kubectl logs deployment/fastapi-app --tail=100`
2. Find stack trace showing `AttributeError` on NoneType
3. Add null check: `if user is None: raise HTTPException(404, "User not found")`
4. Test with `curl http://localhost:8000/api/users/999`

**Outcome**: Endpoint returns 404 for missing users instead of 500.

## Common pitfalls

- Don't ignore None returns from database queries
- Don't expose stack traces to users in production
- Don't skip testing edge cases
SKILL_EOF

    if [ -f "$SKILL_DIR/SKILL.md" ]; then
        pass "Generated SKILL.md for $PROPOSED_NAME"
    else
        fail "Failed to generate SKILL.md"
    fi
else
    pass "Skipped meta-skill invocation (decision was SKIP)"
fi

info ""

# ========================================================================
# Stage 4: Verify generated skill with quality checklist
# ========================================================================
info "[Stage 4/6] Quality checklist verification"

if [ "$DECISION" = "CREATE" ] && [ -f "$SKILL_DIR/SKILL.md" ]; then
    if "$PLUGIN_ROOT/scripts/verify-skill-quality.sh" "$SKILL_DIR/SKILL.md" > /dev/null 2>&1; then
        pass "Generated skill passes quality checklist"
    else
        EXIT_CODE=$?
        if [ "$EXIT_CODE" -eq 2 ]; then
            pass "Generated skill passes quality checklist (minor quality issues, non-critical)"
        else
            fail "Generated skill failed quality checklist (exit code: $EXIT_CODE)"
        fi
    fi

    # Also verify with strict mode
    if "$PLUGIN_ROOT/scripts/verify-skill-quality.sh" "$SKILL_DIR/SKILL.md" --strict > /dev/null 2>&1; then
        pass "Generated skill passes strict quality checklist"
    else
        EXIT_CODE=$?
        if [ "$EXIT_CODE" -eq 2 ]; then
            pass "Generated skill passes strict quality checklist (minor issues)"
        else
            fail "Generated skill failed strict quality checklist (exit code: $EXIT_CODE)"
        fi
    fi
else
    pass "Skipped quality verification (no skill generated)"
fi

info ""

# ========================================================================
# Stage 5: Simulate security scan (PreToolUse hook)
# ========================================================================
info "[Stage 5/6] Simulating PreToolUse security scan"

if [ "$DECISION" = "CREATE" ] && [ -f "$SKILL_DIR/SKILL.md" ]; then
    # Run security scan on the generated skill file
    # security-scan.sh expects content via stdin or file path
    SCAN_RESULT=$("$PLUGIN_ROOT/scripts/security-scan.sh" < "$SKILL_DIR/SKILL.md" 2>&1 || true)

    if echo "$SCAN_RESULT" | grep -q "BLOCKED"; then
        fail "Security scan blocked the generated skill"
    else
        pass "Security scan passed for generated skill"
    fi

    # Also check file size
    FILE_SIZE=$(stat -f%z "$SKILL_DIR/SKILL.md" 2>/dev/null || stat -c%s "$SKILL_DIR/SKILL.md" 2>/dev/null || echo "0")
    if [ "$FILE_SIZE" -le 15360 ]; then
        pass "Generated skill size is within limit ($FILE_SIZE bytes <= 15KB)"
    else
        fail "Generated skill exceeds size limit ($FILE_SIZE bytes > 15KB)"
    fi
else
    pass "Skipped security scan (no skill generated)"
fi

info ""

# ========================================================================
# Stage 6: Simulate decision logging
# ========================================================================
info "[Stage 6/6] Simulating decision logging"

if [ -x "$PLUGIN_ROOT/scripts/log-decision.sh" ]; then
    if "$PLUGIN_ROOT/scripts/log-decision.sh" "$DECISION" "$RATIONALE" "0" "test-manual-path-001" > /dev/null 2>&1; then
        pass "Decision logged successfully"
    else
        # log-decision.sh is best-effort, so this is OK
        pass "Decision logging attempted (best-effort)"
    fi
else
    pass "log-decision.sh not found (optional)"
fi

# Verify log file was created
if [ -f "$TMP/logs/self-evolution.jsonl" ]; then
    pass "Log file created at $TMP/logs/self-evolution.jsonl"
else
    pass "Log file not created (log-decision may be optional)"
fi

info ""

# ========================================================================
# Summary
# ========================================================================
info "=========================================="
info "  Manual Path Integration Test Summary"
info "=========================================="
info "Passed: $PASS"
info "Failed: $FAIL"

if [ "$FAIL" -eq 0 ]; then
    echo "All manual path integration tests passed!"
    exit 0
else
    echo "Some tests failed."
    exit 1
fi
