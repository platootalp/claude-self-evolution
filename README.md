# self-evolution

> Auto-curate `~/.claude/skills/` from your conversations via companion-mode background review.

**Version:** 0.5.0
**License:** MIT
**Compatible with:** Claude-Code v1.0.0+
**Runtime:** Node.js 18+ (TypeScript, esbuild single-file bundle)

---

## What it does

The self-evolution plugin automatically extracts reusable workflows from your conversations and converts them into well-structured Claude skills. It runs in two modes:

- **Auto mode**: Triggers automatically via Stop hook when the session ends (every 10 tool calls by default), spawning a detached companion process (`claude -p`) for review
- **Manual mode**: Review and extract workflows on-demand via `/evolve-review` command

Security scanning is embedded directly in the reviewer's write flow — no global PreToolUse hooks blocking your normal work.

### Key Features

- **Companion-mode review**: Background `claude -p` process handles skill creation without blocking your session
- **Hard-gated security**: Path whitelist + content scanning (prompt injection, dangerous bash, secrets, base64-encoded attacks) enforced before every Write
- **Meta-skill generation**: Uses evolve-skill-writer to ensure consistent, well-formed SKILL.md files
- **JSONL logging**: All decisions and actions logged for auditability
- **TypeScript runtime**: Single-file esbuild bundle (`dist/runtime.mjs`) — no shell script dependencies

---

## Two paths: Auto vs Manual

| Feature             | Auto Mode (Stop Hook)                                              | Manual Mode (/evolve-review)                         |
| ------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| **Trigger**         | Session ends after ≥10 tool calls                                  | User runs command during or after session            |
| **Workflow**        | `PostToolUse → Stop hook → spawn companion` → background review   | `/evolve-review` → skill-reviewer agent → meta-skill |
| **Blocking**        | Never blocks — companion runs detached                             | Interactive (shows decision)                         |
| **User visibility** | Silent (check status via `/evolve-status`)                         | Interactive (shows decision log)                     |
| **Use case**        | "Set it and forget it"                                             | On-demand extraction after a good conversation       |
| **Config**          | `nudge_interval` userConfig                                        | Command-line flags                                   |
| **Safety**          | Security scan embedded in reviewer write flow                      | Same security scan                                   |

---

## Security model

Self-evolution enforces security at the point of skill creation — inside the reviewer's write flow — rather than via a global PreToolUse hook.

### Path whitelist

- **Allowed**: `~/.claude/skills/<name>/SKILL.md` (only this exact pattern)
- **Blocked**: Everything else under `~/.claude/` (CLAUDE.md, settings, etc.)
- **Allowed**: Any path outside `~/.claude/` (project code is not restricted)

### Content scanning

The `runtime security-scan` command checks all skill content before writing:

| Category | Detects | Examples |
|---|---|---|
| Prompt injection | Instruction override patterns | "ignore previous instructions", "you are now..." |
| Dangerous bash | Destructive shell commands | `rm -rf /`, `curl ... \| sh`, `eval $(...)` |
| Secret leaks | API keys and credentials | `sk-...`, `AKIA...`, `ghp_...`, private key headers |
| Base64 attacks | Encoded malicious content | Decodes and scans base64 strings ≥20 chars |
| Size limit | Oversize skill files | >15KB default (configurable) |

### How it works

1. Reviewer decides to CREATE/UPDATE a skill
2. Before calling Write, reviewer runs: `node runtime.mjs security-scan --path <path> --content <content>`
3. If `{allowed: false}`, the reviewer outputs `SKIPPED: hard_gate_blocked: <reason>` and does NOT write
4. Only `{allowed: true}` proceeds to Write

---

## Install

### Step 1: Add the marketplace from GitHub

In Claude Code, add this repository as a plugin marketplace (see [plugin marketplaces](https://code.claude.com/docs/zh-CN/plugin-marketplaces)):

```bash
/plugin marketplace add platootalp/claude-self-evolution
```

**SSH-only environments:** use the full git URL instead:

```bash
/plugin marketplace add git@github.com:platootalp/claude-self-evolution.git
```

### Step 2: Install the plugin from the marketplace

```bash
/plugin install self-evolution@self-evolution-marketplace
```

### Step 3: Verify installation

```bash
/plugin list
```

You should see `self-evolution v0.5.0` in the installed plugins list.

### Optional: Configure settings

Settings can be configured via the plugin's userConfig (displayed in Claude Code's plugin settings UI) or via environment variables:

```bash
export SELF_EVOLUTION_NUDGE_INTERVAL=15  # Trigger every 15 tool calls instead of 10
```

---

## Configuration

| Setting | Default | Description | Environment Variable |
|---|---|---|---|
| `nudge_interval` | 10 | Tool calls between auto-trigger events | `SELF_EVOLUTION_NUDGE_INTERVAL` |
| `max_skill_size_kb` | 15360 | Maximum SKILL.md file size in bytes | `SELF_EVOLUTION_MAX_SKILL_SIZE` |
| `review_model` | "sonnet" | Model for background companion process | `CLAUDE_PLUGIN_OPTION_review_model` |
| `platform` | "auto" | Agent platform: auto, claude-code, codex, cursor | `CLAUDE_PLUGIN_OPTION_platform` |

Environment variables override userConfig settings at runtime.

---

## Runtime Commands

All functionality is routed through `dist/runtime.mjs`:

| Command | Hook/Usage | Description |
|---|---|---|
| `session-start` | SessionStart hook | Diagnostic log on session start |
| `post-tool-use` | PostToolUse hook | Increment tool call counter, set pending_review at threshold |
| `stop-gate` | Stop hook | Consume pending_review, spawn companion process if due |
| `security-scan` | Called by reviewer before Write | Scan path + content, return `{allowed, reason?}` |
| `review-context` | Called by companion agent | Return transcript summary + existing skills list |
| `log-decision` | Called by reviewer after decision | Log CREATED/UPDATED/SKIPPED decision to JSONL |
| `status` | `/evolve-status` command | Show sessions and background jobs |

---

## Monitoring & Logs

### JSONL logging

All decisions and security events are logged to `self-evolution.jsonl`:

```json
{"ts":"2026-05-14T12:34:56Z","level":"info","event":"diag_hook_fired","CLAUDE_PLUGIN_ROOT":"/path"}
{"ts":"2026-05-14T12:35:12Z","level":"info","event":"reviewer_decision","decision":"CREATED","detail":"reusable 3-step debug workflow","session_id":"abc"}
```

### Check status

```bash
/evolve-status
```

Or directly:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" status
```

### Query logs with jq

```bash
# Check recent decisions
cat ~/.claude/logs/self-evolution.jsonl | jq -r 'select(.event == "reviewer_decision")'

# Check security blocks
cat ~/.claude/logs/self-evolution.jsonl | jq -r 'select(.event | test("security|blocked"))'
```

---

## Troubleshooting

### Disable the plugin temporarily

```bash
/plugin disable self-evolution

# Or set a very high nudge interval
export SELF_EVOLUTION_NUDGE_INTERVAL=999999

# To re-enable
/plugin enable self-evolution
```

### Reset plugin state

If the plugin gets stuck in a bad state:

```bash
# Delete the state file (resets all session counters and job history)
rm -f ~/.claude/plugins/data/self-evolution-self-evolution-marketplace/state.json

# Note: Generated skills in ~/.claude/skills/ are NOT deleted
# You must manage those manually
```

### Companion process not spawning

The Stop hook spawns `claude -p` as a detached background process. If reviews aren't happening:

1. Check that `claude` is available in PATH
2. Check logs for spawn errors: `cat ~/.claude/logs/self-evolution.jsonl | jq -r 'select(.event | test("spawn|error"))'`
3. Verify the runtime bundle exists: `ls "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs"`

### False positives in security scan

The content scanner may block legitimate content that matches attack patterns. To work around:

1. Use manual mode (`/evolve-review`) to review the block reason before creating
2. Edit the skill content to avoid matching patterns (e.g., rephrase security-related documentation)
3. Adjust `max_skill_size_kb` if the skill is too large

---

## Architecture

```
self-evolution/
├── dist/runtime.mjs          # esbuild single-file bundle (entry point)
├── src/                      # TypeScript source
│   ├── runtime.ts            # Command router
│   ├── types.ts              # Shared type definitions
│   ├── commands/             # 7 command handlers
│   └── lib/                  # Core libraries (state, security, logger, spawner, transcript)
├── hooks/hooks.json          # Pure command hooks → runtime.mjs
├── agents/skill-reviewer.md  # Thin forwarder using runtime commands
├── commands/                 # /evolve-review, /evolve-status
├── prompts/review-prompt.md  # Companion agent prompt template
├── skills/evolve-skill-writer/  # Meta-skill for SKILL.md generation
└── .claude-plugin/plugin.json   # Plugin manifest (v0.5.0)
```

Key design decisions (v0.5.0):
- **TypeScript + esbuild** instead of shell scripts for type safety and cross-platform support
- **Pure command hooks** instead of AgentHook — all hooks are `type: "command"`, no in-session agents
- **Companion mode** — Stop hook spawns detached `claude -p` process, never blocks the main session
- **Security in reviewer flow** — scanning happens at write time inside the reviewer, not via global PreToolUse hook

---

## Support and Feedback

- **Issues**: Report bugs or feature requests via the project's issue tracker
- **Discussion**: Join the community for best practices and troubleshooting
- **Contribution**: Pull requests welcome for improvements to the meta-skill, security scanner, or documentation
