# Self-Evolution Observability Design

## Problem

The plugin's auto-improvement mechanism (Stop hook → background review → skill CREATE/UPDATE/SKIP) currently has minimal observability. Users cannot verify whether the auto-improvement pipeline is working correctly, understand why decisions were made, or assess skill quality. The existing JSONL log mixes all sessions into one file, making it hard to trace per-session behavior.

## Goals

1. Development debugging: verify each stage of the pipeline (hook trigger → review launch → skill write) works
2. Daily review: understand what the auto-improvement did, why it SKIPPED, what skills were created
3. Verify correctness across four dimensions: flow correctness, skill quality, decision accuracy, performance/resources

## Design

### 1. Tiered Logging System

Three log levels controlled by `log_level` config:

| Level | Behavior | Events |
|-------|----------|--------|
| `off` | No logging | None |
| `info` (default) | Key decision points | `hook_triggered`, `review_decision`, `skill_written`, `security_blocked`, `review_error` |
| `debug` | Full pipeline trace | All info events + `counter_state`, `spawn_launched`, `spawn_completed`, `context_retrieved`, `security_scan_detail`, `skill_content_preview` |

**Config precedence**: `SELF_EVOLUTION_LOG_LEVEL` env var > `config.json` `log_level` field > default `"info"`

**config.json addition**:
```json
{
  "log_level": "info"
}
```

**Log event schema** (JSONL, one JSON object per line):
```json
{"ts":"2026-05-14T12:34:56Z","level":"info","event":"review_decision","decision":"CREATED","detail":"3-step debug workflow","session_id":"abc","skill_name":"debug-memory-leak"}
```

### 2. Session-Isolated Storage

Replace single-file logging with per-session directories:

```
~/.claude/plugins/data/self-evolution/
├── sessions/
│   ├── <session-id-1>/
│   │   ├── state.json        # Session state (count, pending_review, start_ts, end_ts, review results)
│   │   └── log.jsonl          # Session-scoped log entries (filtered by log_level)
│   ├── <session-id-2>/
│   │   ├── state.json
│   │   └── log.jsonl
│   └── ...
└── stats.json                 # Global aggregated stats for /evolve-status
```

**`<session-id>/state.json`**:
```json
{
  "count": 10,
  "pending_review": false,
  "start_ts": "2026-05-14T12:00:00Z",
  "end_ts": "2026-05-14T13:30:00Z",
  "review_decision": "CREATED",
  "review_detail": "3-step debug workflow",
  "skill_name": "debug-memory-leak",
  "review_duration_ms": 12500
}
```

**`stats.json`** (global, updated after each review decision):
```json
{
  "last_updated": "2026-05-14T13:30:00Z",
  "total_sessions": 42,
  "total_created": 5,
  "total_updated": 2,
  "total_skipped": 12,
  "skip_reasons": {"too specific": 6, "already exists": 4, "one-off": 2},
  "recent_decisions": [
    {"ts": "...", "session_id": "...", "decision": "CREATED", "detail": "...", "skill_name": "..."}
  ]
}
```

### 3. Instrumentation Points

| Command | info events | debug events |
|---------|------------|-------------|
| `session-start` | `hook_triggered` (event=session_start) | `counter_state` |
| `post-tool-use` | `hook_triggered` (event=post_tool_use, only when pending_review becomes true) | `counter_state` (every call) |
| `stop-gate` | `review_launched` (session_id, pid) / `review_skipped` (reason) | `spawn_launched` (full command+pid), `spawn_completed` (exit_code+duration_ms) |
| `review-context` | — | `context_retrieved` (session_id, transcript length, skills count) |
| `security-scan` | `security_blocked` (category + matched content preview) | `security_scan_detail` (all scan results, including passed) |
| `log-decision` | `review_decision` (decision+detail+skill_name) | `skill_content_preview` (first 200 chars), `skill_written` (path+size) |

**Data flow**:

```
SessionStart hook
  └─ logger.info("hook_triggered", {event: "session_start"})

PostToolUse hook (every 10 calls)
  └─ logger.debug("counter_state", {count, pending_review})
  └─ if pending_review → logger.info("hook_triggered", {event: "post_tool_use", pending: true})

Stop hook
  └─ if no pending_review → logger.info("review_skipped", {reason})
  └─ if pending_review →
      ├─ logger.info("review_launched", {session_id, pid})
      ├─ logger.debug("spawn_launched", {command, pid})
      └─ (on completion) logger.debug("spawn_completed", {exit_code, duration_ms})

Review Agent (background)
  ├─ review-context → logger.debug("context_retrieved", {...})
  ├─ decision → logger.info("review_decision", {decision, detail, skill_name})
  ├─ security-scan →
  │   ├─ blocked → logger.info("security_blocked", {category, detail})
  │   └─ passed → logger.debug("security_scan_detail", {results})
  └─ skill written →
      ├─ logger.info("skill_written", {path, size_bytes})
      └─ logger.debug("skill_content_preview", {preview: content.slice(0,200)})
```

**Error handling**: All try/catch blocks add `logger.info("review_error", {error: message, stage: "spawn"|"context"|"scan"|"write"})` to prevent silent failures.

### 4. Upgraded /evolve-status Command

Returns structured summary:

```json
{
  "active": {
    "sessions": {...},
    "jobs": [...]
  },
  "stats": {
    "period": "30d",
    "created": 5,
    "updated": 2,
    "skipped": 12,
    "skip_reasons": {"too specific": 6, "already exists": 4, "one-off": 2}
  },
  "recent_decisions": [
    {"ts": "...", "decision": "CREATED", "detail": "...", "skill_name": "debug-memory-leak"}
  ],
  "performance": {
    "avg_review_duration_ms": 12500,
    "spawn_failure_rate": 0.0
  }
}
```

When `log_level=off` or stats.json doesn't exist, `stats`, `recent_decisions`, and `performance` return `null` with a hint message.

### 5. Implementation Changes

**Files to modify**:
- `src/lib/logger.ts` — Add level filtering, session-scoped log path, level-aware methods
- `src/lib/state.ts` — Persist state per session to `<session-dir>/state.json`, maintain stats.json
- `src/commands/session-start.ts` — Create session directory, log hook_triggered
- `src/commands/post-tool-use.ts` — Add counter_state debug log, hook_triggered info log
- `src/commands/stop-gate.ts` — Log review_launched/review_skipped, spawn details
- `src/commands/review-context.ts` — Add context_retrieved debug log
- `src/commands/security-scan.ts` — Add security_blocked/security_scan_detail logs
- `src/commands/log-decision.ts` — Add review_decision info log, skill content debug logs
- `src/commands/status.ts` — Read stats.json, aggregate and return structured summary
- `config.default.json` — Add `"log_level": "info"` field

**Files to create**:
- None (all changes are modifications to existing files)

### 6. Future: /evolve-report (Feature Placeholder)

A future `/evolve-report` command that generates Markdown reports with:
- Decision distribution charts (ASCII)
- Skill quality trends (7-day window)
- Performance metrics dashboard
- Anomaly event summaries

This is documented as a future feature in `docs/feature/`.
