#!/usr/bin/env bash
# scripts/log-decision.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib/log.sh"

DECISION="${1:-unknown}"
DETAIL="${2:-}"
DUR_MS="${3:-0}"
SID="${4:-}"

log_decision "$DECISION" "$DETAIL" "$DUR_MS" "$SID"
