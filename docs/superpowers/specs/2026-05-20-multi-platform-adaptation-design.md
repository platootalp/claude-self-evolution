# Multi-Platform Adaptation Design

**Date:** 2026-05-20
**Status:** Approved
**Scope:** Adapt self-evolution to work as a native plugin for Codex and Cursor, in addition to Claude Code

## Problem

Self-evolution currently only runs as a Claude Code plugin. The `spawner.ts` has stub `CodexSpawner` and `CursorSpawner` implementations that throw "not implemented". The plugin manifest, hooks, and companion mode are all tightly coupled to Claude Code's CLI and env vars.

## Goal

Make self-evolution work as a full native plugin on all three platforms — Claude Code, Codex, and Cursor — with hooks, commands, agents, companion mode, and skill management all functional. Codex first, then Cursor.

## Architecture: Platform Adapter Layer

Extend the existing `AgentSpawner` pattern into a full `PlatformAdapter` interface. Each platform gets its own manifest directory and hook config, but shares the same `runtime.mjs` bundle. Platform detection happens at runtime via env vars.

### PlatformAdapter Interface

```typescript
interface PlatformAdapter {
  // Identity
  platform: 'claude-code' | 'codex' | 'cursor';

  // Paths
  pluginManifestDir: string;      // .claude-plugin | .codex-plugin | .cursor-plugin
  skillDirs: string[];            // ~/.claude/skills | ~/.agents/skills | ~/.cursor/skills

  // Env vars
  envPluginRoot: string;          // CLAUDE_PLUGIN_ROOT | PLUGIN_ROOT | CURSOR_PROJECT_DIR
  envPluginData: string;          // CLAUDE_PLUGIN_DATA | PLUGIN_DATA | (derived)
  envSessionId: string;           // (auto) | CODEX_SESSION_ID | CURSOR_SESSION_ID

  // CLI companion
  companionCommand: string;       // claude -p | codex exec | agent -p
  companionFlags: string[];       // platform-specific flags

  // Hook format
  hookFile: string;               // hooks/hooks.json | hooks/hooks.codex.json | hooks/hooks.cursor.json
  hookEventNames: Record<string, string>; // internal name → platform event name

  // Transcript
  transcriptFormat: 'json-array' | 'jsonl' | 'codex-jsonl' | 'cursor-jsonl';

  // Spawning
  spawnCompanion(prompt: string, opts: SpawnOptions): ChildProcess;
}
```

### Platform Detection

Extends existing `detectPlatform()` in `spawner.ts`:

1. `CLAUDE_PLUGIN_ROOT` env var → `claude-code`
2. `CODEX_SESSION_ID` env var → `codex`
3. `CURSOR_PROJECT_DIR` env var → `cursor`
4. Fallback: check which manifest directory exists (`.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`)
5. Final fallback: `claude-code` (preserves backward compatibility)

### Adapter Implementations

**ClaudeCodeAdapter** — wraps existing behavior, no functional changes.
**CodexAdapter** — uses `codex exec` for companion, Codex env vars, Codex hook format.
**CursorAdapter** — uses `agent -p` for companion, Cursor env vars, Cursor hook format.

## Hook System Adaptation

### Event Name Mapping

| Internal Event | Claude Code | Codex | Cursor |
|----------------|-------------|-------|--------|
| session-start | SessionStart | SessionStart | sessionStart |
| post-tool-use | PostToolUse | PostToolUse | postToolUse |
| stop | Stop | Stop | stop |

### Hook Config Files

- `hooks/hooks.json` — Claude Code (unchanged, original)
- `hooks/hooks.codex.json` — Codex format
- `hooks/hooks.cursor.json` — Cursor format

### Codex Hook Format

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "node runtime.mjs session-start",
        "timeout": 5
      }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "node runtime.mjs post-tool-use",
        "timeout": 5
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "node runtime.mjs stop-gate",
        "timeout": 30,
        "statusMessage": "evolve: checking..."
      }]
    }]
  }
}
```

### Cursor Hook Format

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [{ "command": "node runtime.mjs session-start", "timeout": 5 }],
    "postToolUse": [{ "command": "node runtime.mjs post-tool-use", "timeout": 5, "matcher": "*" }],
    "stop": [{ "command": "node runtime.mjs stop-gate", "timeout": 30 }]
  }
}
```

### stdin Normalization

Each platform sends JSON on stdin with different field names. A `normalizeHookInput()` function in the adapter maps to a common `HookInput` type:

```typescript
interface HookInput {
  sessionId: string;
  transcriptPath: string | null;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  cwd?: string;
  hookEventName?: string;
  model?: string;
  permissionMode?: string;
}
```

- Claude Code: `session_id` → `sessionId`, `transcript_path` → `transcriptPath`, `tool_name` → `toolName`
- Codex: same base fields, plus `hook_event_name`, `model`, `permission_mode`
- Cursor: same base fields, plus `hook_event_name`, `model`

## Companion Mode per Platform

### Claude Code (existing, unchanged)

```bash
claude -p "<prompt>" --allowedTools Read,Write,Bash,Glob,Grep,Skill --max-turns 8 --output-format json
```

### Codex

```bash
codex exec "<prompt>" --json
```

- Uses `codex exec` for non-interactive mode
- `--json` for structured output (JSON lines)
- No `--allowedTools` flag (permissions handled via hooks/PermissionRequest)
- No `--max-turns` flag (relies on natural completion or model reasoning effort)
- Session resume via `codex exec resume --last`

### Cursor

```bash
agent -p "<prompt>" --output-format text
```

- Uses `agent -p` for non-interactive mode
- No `--allowedTools` or `--max-turns` flags
- `--sandbox enabled` to enforce sandbox
- Background mode via `&` prefix pushes to Cloud Agent (different from local companion)

### Companion Env Vars

| Purpose | Claude Code | Codex | Cursor |
|---------|-------------|-------|--------|
| Plugin root | `CLAUDE_PLUGIN_ROOT` | `PLUGIN_ROOT` + `CLAUDE_PLUGIN_ROOT` | `CURSOR_PROJECT_DIR` + `CLAUDE_PROJECT_DIR` |
| Plugin data | `CLAUDE_PLUGIN_DATA` | `PLUGIN_DATA` + `CLAUDE_PLUGIN_DATA` | (derived from project dir) |
| Session ID | `SELF_EVOLUTION_SESSION_ID` | same | same |
| Review mode | `SELF_EVOLUTION_REVIEW_MODE=1` | same | same |

The adapter's `spawnCompanion()` builds the correct command, sets the right env vars, and spawns a detached child process. The spawned companion reads the same `skill-reviewer` agent instructions (platform-agnostic — they call `runtime.mjs` commands).

## Directory Structure

```
self-evolution/
├── .claude-plugin/
│   └── plugin.json              # Existing (unchanged)
├── .codex-plugin/
│   └── plugin.json              # NEW — Codex manifest
├── .cursor-plugin/
│   └── plugin.json              # NEW — Cursor manifest
├── hooks/
│   ├── hooks.json               # Claude Code (unchanged, original)
│   ├── hooks.codex.json         # NEW
│   └── hooks.cursor.json        # NEW
├── src/
│   ├── runtime.ts               # Updated: adapter-aware command routing
│   ├── types.ts                 # Updated: PlatformAdapter, HookInput types
│   ├── lib/
│   │   ├── adapter.ts           # NEW: PlatformAdapter interface + detection + factory
│   │   ├── adapters/
│   │   │   ├── claude-code.ts   # NEW: ClaudeCodeAdapter
│   │   │   ├── codex.ts         # NEW: CodexAdapter
│   │   │   └── cursor.ts        # NEW: CursorAdapter
│   │   ├── spawner.ts           # Updated: delegates to adapter.spawnCompanion()
│   │   ├── transcript.ts        # Updated: multi-format transcript parsing
│   │   ├── security.ts          # Updated: platform-aware skill path whitelist
│   │   ├── state.ts             # Unchanged
│   │   ├── config.ts            # Updated: platform-aware config resolution
│   │   └── logger.ts            # Unchanged
│   └── commands/                # Unchanged (all command handlers are platform-agnostic)
├── agents/                      # Unchanged
├── commands/                    # Unchanged
├── skills/                      # Unchanged
└── prompts/                     # Unchanged
```

### Codex Manifest (`.codex-plugin/plugin.json`)

```json
{
  "name": "self-evolution",
  "version": "0.12.0",
  "description": "Auto-extract reusable workflows as skills",
  "author": { "name": "self-evolution" },
  "skills": "./skills/",
  "hooks": "./hooks/hooks.codex.json",
  "interface": {
    "displayName": "Self-Evolution",
    "category": "Productivity",
    "capabilities": ["Read", "Write"]
  }
}
```

### Cursor Manifest (`.cursor-plugin/plugin.json`)

```json
{
  "name": "self-evolution",
  "version": "0.12.0",
  "description": "Auto-extract reusable workflows as skills",
  "author": { "name": "self-evolution" }
}
```

## Transcript Parsing

Each platform uses a different transcript format. The `transcript.ts` parser gets a `parseTranscript(path, format)` function that handles all formats.

| Platform | Format | Key Differences |
|----------|--------|-----------------|
| Claude Code | JSON array or JSONL | `tool_name`, `tool_input`, `tool_output` |
| Codex | JSONL with `item` events | `type: "command_execution"`, different event schema |
| Cursor | JSONL | Same schema as Claude Code (Cursor's agent uses the same tool names). If format differs at runtime, the Codex/Claude Code parsers will be tried as fallbacks. |

Each adapter declares its `transcriptFormat`, and the runtime selects the right parser.

## Skill Path Resolution

The security scanner's path whitelist becomes platform-aware via the adapter's `skillDirs`:

- Claude Code: `~/.claude/skills/<name>/SKILL.md`
- Codex: `~/.agents/skills/<name>/SKILL.md`
- Cursor: `~/.cursor/skills/<name>/SKILL.md`

Cursor reads `~/.claude/skills/` and `~/.codex/skills/` as fallback directories, so skills created on one platform are visible on others.

## Config Resolution

The `config.ts` `resolvePaths()` function uses adapter env vars instead of hardcoded `CLAUDE_PLUGIN_ROOT/DATA`. Each adapter provides its preferred env var names.

## Error Handling

- **Platform detection failure:** Default to `claude-code` with a warning log. Backward compatible.
- **Companion spawn failure:** If `codex exec` or `agent -p` is not found, log the error and skip the review. The stop-gate still allows the session to stop.
- **Transcript parse failure:** Fall back to raw text extraction. Log a warning.
- **Hook format mismatch:** The adapter normalizes event names. If an unknown event is received, log and ignore.

## Testing

- Unit tests for each adapter (mocked env vars, no actual CLI calls)
- Unit tests for `normalizeHookInput()` with samples from each platform
- Unit tests for `spawnCompanion()` command construction (verify correct CLI flags)
- Integration test: `detectPlatform()` with each env var set
- Existing tests continue to pass unchanged (Claude Code is still the default)
- No new integration dependencies — all platform-specific behavior is behind the adapter interface and testable with mocks

## Build & Packaging

- Single `npm run build` still produces `dist/runtime.mjs`
- Build is platform-agnostic — platform detection happens at runtime
- A `scripts/package.sh` creates 3 distributable packages, each with the correct manifest + hooks file
- Version bumped to `0.12.0` across all 3 manifests

## Implementation Priority

1. **Phase 1: Codex** — Create adapter interface, implement CodexAdapter, Codex manifest, Codex hooks, Codex companion mode
2. **Phase 2: Cursor** — Implement CursorAdapter, Cursor manifest, Cursor hooks, Cursor companion mode
3. **Phase 3: Packaging** — Build `scripts/package.sh` for multi-platform distribution
