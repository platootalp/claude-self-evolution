#!/usr/bin/env bash
# scripts/lib/posix-lock.sh
# POSIX-only mkdir lock helpers, sourced by nudge-state.sh.

if ! command -v log_event >/dev/null 2>&1; then
    _LOCK_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    . "$_LOCK_LIB_DIR/log.sh"
fi

acquire_lock() {
    local lock_dir="$1"
    local timeout="${2:-5}"
    local elapsed=0
    while ! mkdir "$lock_dir" 2>/dev/null; do
        sleep 0.05
        elapsed=$(awk "BEGIN {print $elapsed + 0.05}")
        case $(awk "BEGIN {print ($elapsed > $timeout)}") in
            1)
                log_event warn lock_timeout \
                    "$(jq -nc --arg l "$lock_dir" --arg e "$elapsed" --arg t "$timeout" \
                        '{lock:$l, elapsed_s:($e|tonumber), timeout_s:($t|tonumber)}')"
                echo "lock timeout: $lock_dir (after ${elapsed}s)" >&2
                return 1
                ;;
        esac
    done
}

release_lock() {
    local lock_dir="$1"
    rmdir "$lock_dir" 2>/dev/null || true
}