#!/usr/bin/env bash
# tests/integration/test_manual_path.sh
# 集成测试：手动演化路径
#
# 注意：此测试为 stub，完整的端到端测试需要真实的 Claude 环境
# 当前版本提供基本的验证框架
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TMP=$(mktemp -d -t evolve-manual-test-XXXXXX)
trap 'rm -rf "$TMP"' EXIT

export CLAUDE_PLUGIN_ROOT="$TMP"
export SELF_EVOLUTION_LOG_DIR="$TMP/logs"
mkdir -p "$TMP/data"
mkdir -p "$TMP/logs"

fail() { echo "FAIL: $*" >&2; exit 1; }
info() { echo "INFO: $*"; }

# Stub tests that verify basic setup
info "Test 1: Plugin root directory exists"
[ -d "$PLUGIN_ROOT" ] || fail "Plugin root not found"

info "Test 2: Scripts directory exists"
[ -d "$PLUGIN_ROOT/scripts" ] || fail "Scripts directory not found"

info "Test 3: Core scripts are executable"
[ -x "$PLUGIN_ROOT/scripts/nudge-state.sh" ] || fail "nudge-state.sh not executable"
[ -x "$PLUGIN_ROOT/scripts/stop-gate.sh" ] || fail "stop-gate.sh not executable"
[ -x "$PLUGIN_ROOT/scripts/security-scan.sh" ] || fail "security-scan.sh not executable"

info "Test 4: Manual evolution scripts exist"
[ -f "$PLUGIN_ROOT/scripts/trigger-evolution.sh" ] || fail "trigger-evolution.sh not found"
[ -f "$PLUGIN_ROOT/scripts/manual-review.sh" ] || fail "manual-review.sh not found"

echo "PASS: manual_path (stub - basic setup verified)"