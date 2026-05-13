#!/usr/bin/env bash
# tests/integration/test_headless_e2e.sh
#
# Real end-to-end integration test driven by `claude -p` (headless / non-interactive)
# using the HOST machine's Claude Code installation, authentication, and settings.
#
# We deliberately do NOT sandbox $HOME: doing so strips ~/.claude/auth and
# ~/.claude/settings.json, which means `claude` either errors out or runs as a
# different identity from the one a real user would use. The whole point of an
# e2e test is to exercise the same path a user takes.
#
# What IS sandboxed:
#   - The plugin directory (copied to a mktemp dir) so PostToolUse / Stop hooks
#     write `data/nudge-state.json`, `data/trigger-flag-*.json` into a clean,
#     throwaway location (each test run starts from zero state).
#   - The decision log (via SELF_EVOLUTION_LOG_DIR) so we can assert ONLY on
#     events produced by this run, not on the user's real ~/.claude/logs.
#
# What is NOT sandboxed (intentional):
#   - $HOME / Claude credentials / Claude settings.
#   - ~/.claude/skills/  — the reviewer will write new skills there for real.
#     We snapshot it before the run and, by default, remove any directories
#     that appeared during the run. Set E2E_KEEP_SKILLS=1 to inspect them.
#
# Cases:
#   1. Plugin loadability    — `claude -p --plugin-dir <copy>` returns sentinel.
#   2. Auto-path Stop chain  — Stop[0] gate → trigger flag → Stop[1] reviewer
#                              agent → Stop[2] cleanup, with reviewer_decision
#                              logged into SELF_EVOLUTION_LOG_DIR.
#   3. Manual /evolve-review — invoking the slash command in a -p session yields
#                              a reviewer_decision (in log OR in stdout).
#
# Default: SKIP. Opt-in by setting RUN_CLAUDE_E2E=1 (this consumes real Claude
# API credits / requires interactive auth; gate it behind a separate CI job).
#
# See docs/testing.md for the rationale and CI integration notes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ "${RUN_CLAUDE_E2E:-}" != "1" ]; then
    echo "SKIP: set RUN_CLAUDE_E2E=1 to run headless Claude e2e (docs/testing.md)"
    exit 0
fi

if ! command -v claude >/dev/null 2>&1; then
    echo "FAIL: claude not in PATH"
    exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
    echo "FAIL: jq not in PATH"
    exit 1
fi

# ---------------------------------------------------------------------------
# Sandbox setup (plugin + log only; HOME is untouched on purpose)
# ---------------------------------------------------------------------------
TMP=$(mktemp -d -t evolve-e2e-XXXXXX)
SANDBOX_PLUGIN="$TMP/self-evolution"
SANDBOX_LOG_DIR="$TMP/logs"
LOG_FILE="$SANDBOX_LOG_DIR/self-evolution.jsonl"

mkdir -p "$SANDBOX_LOG_DIR"

# Copy the plugin into a tmp dir so hook writes to ${CLAUDE_PLUGIN_ROOT}/data/
# don't dirty the source tree across runs. Drop any state copied along.
cp -R "$PLUGIN_ROOT/." "$SANDBOX_PLUGIN/"
rm -rf "$SANDBOX_PLUGIN/data" 2>/dev/null || true
mkdir -p "$SANDBOX_PLUGIN/data"

export SELF_EVOLUTION_LOG_DIR="$SANDBOX_LOG_DIR"
# Lower the trigger threshold so a short -p session can satisfy the auto-path gate.
export SELF_EVOLUTION_NUDGE_INTERVAL="${SELF_EVOLUTION_NUDGE_INTERVAL:-2}"

# Per-case wall-clock timeout (seconds). claude -p with reviewer agent + meta
# skill can be slow on cold starts; raise via env if you see flaky timeouts.
CASE_TIMEOUT="${E2E_CASE_TIMEOUT:-180}"

# Snapshot real ~/.claude/skills/ so we can identify (and clean up) any skills
# the reviewer creates during this run.
SKILLS_DIR="$HOME/.claude/skills"
mkdir -p "$SKILLS_DIR"
SKILLS_BEFORE=$(mktemp -t evolve-e2e-skills-XXXXXX)
( cd "$SKILLS_DIR" && find . -maxdepth 1 -mindepth 1 -type d | sort > "$SKILLS_BEFORE" ) || true

cleanup() {
    # Diff skills dir; remove anything that appeared during this run, unless
    # the user explicitly asked to keep it.
    if [ "${E2E_KEEP_SKILLS:-0}" != "1" ] && [ -d "$SKILLS_DIR" ]; then
        local after
        after=$(mktemp -t evolve-e2e-skills-after-XXXXXX)
        ( cd "$SKILLS_DIR" && find . -maxdepth 1 -mindepth 1 -type d | sort > "$after" ) || true
        local new
        new=$(comm -13 "$SKILLS_BEFORE" "$after" || true)
        if [ -n "$new" ]; then
            echo ""
            echo "Cleaning up skills generated during this run:"
            while IFS= read -r dir; do
                [ -n "$dir" ] || continue
                local target="$SKILLS_DIR/${dir#./}"
                if [ -d "$target" ]; then
                    echo "  - removing $target"
                    rm -rf "$target"
                fi
            done <<< "$new"
        fi
        rm -f "$after"
    else
        echo ""
        echo "E2E_KEEP_SKILLS=1: leaving generated skills in $SKILLS_DIR"
    fi
    rm -f "$SKILLS_BEFORE"
    rm -rf "$TMP"
}
trap cleanup EXIT

CLAUDE_OPTS=(
    -p
    --plugin-dir "$SANDBOX_PLUGIN"
    --permission-mode dontAsk
    --output-format text
)

PASS=0
FAIL=0
FAILS=()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
run_case() {
    local name="$1"
    shift
    printf '  %-44s ' "$name"
    local out_file
    out_file=$(mktemp -t evolve-e2e-case-XXXXXX)
    if "$@" >"$out_file" 2>&1; then
        echo "PASS"
        PASS=$((PASS + 1))
    else
        echo "FAIL"
        FAIL=$((FAIL + 1))
        FAILS+=("$name")
        echo "    --- output (tail 30) ---"
        tail -n 30 "$out_file" | sed 's/^/    /'
        echo "    ------------------------"
    fi
    rm -f "$out_file"
}

# Run a command with a wall-clock timeout. macOS bash 3.2 has no `timeout`,
# and `gtimeout` may not be installed, so use a portable background+kill pattern.
with_timeout() {
    local secs="$1"
    shift
    "$@" &
    local pid=$!
    local elapsed=0
    while kill -0 "$pid" 2>/dev/null; do
        if [ "$elapsed" -ge "$secs" ]; then
            kill -TERM "$pid" 2>/dev/null || true
            sleep 1
            kill -KILL "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
            echo "with_timeout: command exceeded ${secs}s" >&2
            return 124
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done
    wait "$pid"
}

reset_session_state() {
    rm -f "$SANDBOX_PLUGIN/data"/trigger-flag-*.json 2>/dev/null || true
    rm -f "$SANDBOX_PLUGIN/data/nudge-state.json" 2>/dev/null || true
    : > "$LOG_FILE" 2>/dev/null || true
}

decision_logged() {
    [ -s "$LOG_FILE" ] || return 1
    jq -e 'select(.event == "reviewer_decision")' "$LOG_FILE" >/dev/null 2>&1
}

# ---------------------------------------------------------------------------
# Case 1: smoke — plugin loads, headless claude returns the sentinel string.
# ---------------------------------------------------------------------------
case_smoke() {
    reset_session_state
    local out
    out=$(with_timeout "$CASE_TIMEOUT" claude "${CLAUDE_OPTS[@]}" \
        "Reply with exactly one line containing only: E2E_OK") || return 1
    echo "$out"
    echo "$out" | grep -qE '\bE2E_OK\b'
}

# ---------------------------------------------------------------------------
# Case 2: auto path — Stop hook chain fires, reviewer agent records a decision.
#
# The prompt is engineered to make Claude do >= SELF_EVOLUTION_NUDGE_INTERVAL
# tool calls so the gate flips pending=true before -p exits and Stop runs.
# We accept any reviewer_decision (CREATED / UPDATED / SKIPPED) as proof the
# AgentHook actually executed; success is the chain firing, not the verdict.
# ---------------------------------------------------------------------------
case_auto_path() {
    reset_session_state
    local prompt
    prompt=$(cat <<EOF
Perform the following file inspection workflow inside the sandbox plugin
directory $SANDBOX_PLUGIN. Use one tool call per step:

1. Read $SANDBOX_PLUGIN/.claude-plugin/plugin.json and report its "version" field.
2. Read $SANDBOX_PLUGIN/hooks/hooks.json and report how many entries the Stop
   hook contains.
3. List $SANDBOX_PLUGIN/agents and confirm skill-reviewer.md is present.

After all three steps, print exactly: AUTO_DONE
EOF
)
    local out
    out=$(with_timeout "$CASE_TIMEOUT" claude "${CLAUDE_OPTS[@]}" "$prompt") || return 1
    echo "$out"
    echo "$out" | grep -qE 'AUTO_DONE' || {
        echo "case_auto_path: AUTO_DONE marker missing in claude output" >&2
        return 1
    }

    # Stop[2] cleanup is async; give the reviewer agent a moment to finish.
    local waited=0
    while [ "$waited" -lt 30 ]; do
        if decision_logged; then
            break
        fi
        sleep 2
        waited=$((waited + 2))
    done

    if ! decision_logged; then
        echo "case_auto_path: no reviewer_decision in $LOG_FILE" >&2
        echo "--- log tail ---" >&2
        tail -n 50 "$LOG_FILE" >&2 2>/dev/null || true
        return 1
    fi

    # Trigger flag should have been cleaned up by Stop[2] --cleanup.
    if ls "$SANDBOX_PLUGIN/data"/trigger-flag-*.json >/dev/null 2>&1; then
        echo "case_auto_path: stale trigger-flag still present after Stop[2]" >&2
        return 1
    fi

    return 0
}

# ---------------------------------------------------------------------------
# Case 3: manual path — /evolve-review yields a reviewer_decision.
# ---------------------------------------------------------------------------
case_manual_path() {
    reset_session_state
    local prompt
    prompt=$(cat <<EOF
Demonstrate a small reusable workflow, then ask for review.

Step 1: Read $PLUGIN_ROOT/README.md and report the first H1 heading.
Step 2: List $PLUGIN_ROOT/scripts directory.
Step 3: Print MANUAL_WORKFLOW_DONE.

After step 3, invoke the slash command: /evolve-review
EOF
)
    local out
    out=$(with_timeout "$CASE_TIMEOUT" claude "${CLAUDE_OPTS[@]}" "$prompt") || return 1
    echo "$out"
    echo "$out" | grep -qE 'MANUAL_WORKFLOW_DONE' || {
        echo "case_manual_path: workflow marker missing" >&2
        return 1
    }

    # The slash command returns synchronously inside the same -p turn, so the
    # decision should be logged by the time claude exits.
    if decision_logged; then
        return 0
    fi

    # Some claude builds emit the decision verbatim in stdout instead of through
    # the helper script (e.g. when the Bash log call is denied). Treat that as a
    # passing run too — the reviewer agent clearly executed.
    if echo "$out" | grep -qE '^(CREATED|UPDATED|SKIPPED|ABORTED): '; then
        return 0
    fi

    echo "case_manual_path: neither reviewer_decision log nor decision verb in output" >&2
    return 1
}

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
echo "=========================================="
echo "  Headless Claude E2E (host environment)"
echo "  HOME (untouched):     $HOME"
echo "  plugin sandbox:       $SANDBOX_PLUGIN"
echo "  log sandbox:          $SANDBOX_LOG_DIR"
echo "  real skills dir:      $SKILLS_DIR"
echo "  nudge interval:       $SELF_EVOLUTION_NUDGE_INTERVAL"
echo "  case timeout (s):     $CASE_TIMEOUT"
echo "  keep new skills:      ${E2E_KEEP_SKILLS:-0}"
echo "=========================================="
echo ""

run_case "smoke (plugin loads, -p returns)" case_smoke
run_case "auto path (Stop hook chain)"      case_auto_path
run_case "manual path (/evolve-review)"     case_manual_path

echo ""
echo "Passed: $PASS  Failed: $FAIL"

if [ "$FAIL" -gt 0 ]; then
    echo "Failed cases:"
    for c in "${FAILS[@]}"; do
        echo "  - $c"
    done
    exit 1
fi

echo "PASS: headless claude e2e"
