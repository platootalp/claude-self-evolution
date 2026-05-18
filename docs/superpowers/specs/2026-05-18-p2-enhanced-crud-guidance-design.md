# P2 Design: Enhanced CRUD + Behavior Guidance

> Date: 2026-05-18 | Status: Draft | Approaches: Route B (Enhanced Delegation)

## Overview

P2 enhances the plugin's ability to create, manage, and guide skill creation. It builds on P0/P1's security scanning, validate-skill, and verify-skill infrastructure without introducing a parallel CRUD system. Six features require code changes; two are documentation-only.

## Approach: Minimal Delta (Approach A)

Only change what the spec explicitly requires. No forward-looking abstractions (trust policy engine, custom CRUD layer). The trust policy with a single level doesn't need a separate module. F5-F7 enforcement lives in the reviewer pipeline prompts, not in new code gates.

## Feature Design

### F27: Behavior Guidance (System Prompt)

**Goal**: Make the reviewer agent proactively suggest skill creation after complex workflows.

**Changes**:
- Add "Skill Guidance" section to `agents/skill-reviewer.md`:
  - After complex multi-step workflows, proactively suggest saving a skill
  - When a workflow contradicts an existing skill, suggest updating it
  - Reference `evolve-skill-writer` meta-skill for generation
- Add similar guidance to review prompt variants (`prompts/review-prompt.md`, `prompts/review-prompt-combined.md`)
- No session-start nudge (too noisy per spec)

**Code changes**: Prompt text only, no TypeScript.

### F28: Tool Schema Description Guidance

**Goal**: Document as a platform limitation. Cannot modify Claude Code's built-in `Skill` tool schema.

**Changes**: None. The `evolve-skill-writer` meta-skill's description already contains trigger phrases. Future: if a `skill-manage` tool is built, embed guidance in its schema description.

### F5-F7: Skill CRUD (Enhanced Delegation)

**Goal**: Enforce validate-skill and verify-skill in the reviewer pipeline after every write/edit operation.

**F5 — Create**:
- Reviewer prompt: after Write, MUST call `validate-skill`
- If `validate-skill` fails → abort, report `SKIPPED: validation_failed`
- Category whitelist and frontmatter schema already enforced by `evolve-skill-writer`

**F6 — Edit**:
- Reviewer prompt: before writing, MUST read existing skill first
- After Write/Edit, MUST call `validate-skill` + `verify-skill`
- `evolve-skill-writer` already handles version increment in update mode
- If either fails → report `SKIPPED: validation_failed` or `SKIPPED: verification_failed`

**F7 — Patch**:
- Reviewer prompt: for targeted edits, agent uses Claude Code's Edit tool (not full rewrite)
- After Edit, MUST call `verify-skill`
- No fuzzy matching — rely on Edit tool's exact string matching
- If `verify-skill` fails → report `SKIPPED: verification_failed`

**Updated pipeline** (prompt changes only, commands already exist):
```
Step 1: review-context
Step 2: Rationale (must write before tool calls)
Step 3: security-scan (hard gate)
Step 4: evolve-skill-writer → Write/Edit (create/update/patch)
Step 5: validate-skill (enforced after Write)
Step 6: verify-skill (enforced after Write/Edit)
Step 7: log-decision
Step 8: Output
```

**Code changes**: Prompt text in `skill-reviewer.md` and review prompt variants. No new commands.

### F8: Skill Delete

**Goal**: Allow users to delete plugin-created skills via `/evolve-skill-delete`.

**New slash command**: `commands/evolve-skill-delete.md`
- User-facing: `/evolve-skill-delete <skill-name>`
- Agent validates skill exists at `~/.claude/skills/<name>/`
- Shows skill name and description for user confirmation
- On confirmation, removes skill directory
- Calls `log-decision` with action `DELETED`

**New runtime command**: `delete-skill`
- Handler: `src/commands/delete-skill.ts`
- Validates path is within `~/.claude/skills/` (directory traversal defense)
- Removes the directory
- Returns `{success: boolean, message: string}`

**Error cases**:
- Skill not found → user-friendly error
- Path traversal attempt → security error (defense in depth)

**Code changes**: New command file, new runtime handler, route registration in `runtime.ts`.

### F9-F10: Auxiliary File Management

**Goal**: Allow skills to contain `references/` and `templates/` directories alongside SKILL.md.

**Path whitelist extension** in `scanWrite`:
- Currently: `~/.claude/skills/<name>/SKILL.md` only
- Add: `~/.claude/skills/<name>/references/**` and `~/.claude/skills/<name>/templates/**`

**File type restriction** for auxiliary directories:
- Allowed: `.md`, `.txt`, `.yaml`, `.yml`, `.json`
- Rejected: all other file types (executables, scripts, binaries, etc.)

**Implementation**:
- Update `scanWrite` in `src/lib/security.ts` to match auxiliary paths
- Add `ALLOWED_AUX_EXTENSIONS` constant
- Check extension when path matches `references/` or `templates/`
- Update `evolve-skill-writer` meta-skill to mention auxiliary file support

**Code changes**: `security.ts` path matching + file type validation, `evolve-skill-writer` prompt.

### F15: Atomic Write

**Goal**: Document as a known limitation. No code changes in P2.

**Rationale**: Claude Code's Write tool handles writes. If a custom CRUD layer is built in the future, implement `tempfile + rename`. P1's `verify-skill` provides a soft safety net — if a write is corrupted, validation fails and the reviewer can retry.

### F20: Trust Policy (agent-created Level)

**Goal**: Mark all plugin-created skills as `agent-created` trust level and apply a simple policy.

**Trust policy for `agent-created`**:

| Pattern Severity | agent-created |
|---|---|
| safe | allow |
| caution | allow |
| dangerous | block |

This is identical to current behavior (dangerous = always block). The trust policy becomes meaningful when `community` (caution = block) and `trusted` (dangerous = allow) levels are added in the future.

**Implementation**:
- `evolve-skill-writer` meta-skill adds `trust: agent-created` to generated frontmatter
- `security-scan` command accepts `--trust` flag (default: `agent-created`)
- New function `applyTrustPolicy(severity, trust)` in `security.ts`:
  - `safe` → always allow
  - `caution` → allow (for agent-created; would block for community)
  - `dangerous` → always block
- Trust check runs after pattern matching, before returning the scan result

**Code changes**: `security.ts` (trust policy function), `runtime.ts` (`--trust` flag parsing), `evolve-skill-writer` frontmatter.

### F17: Threat Pattern Extension (P2 Categories)

**Goal**: Add 2 new threat categories for crypto-mining and exfiltration services.

**New categories**:

| Category | Severity | Patterns |
|---|---|---|
| `crypto_mining` | dangerous | `xmrig`, `monero`, `stratum+tcp`, `minerd`, `cpuminer`, `cryptonight`, `hashrate`, `pool.minexmr` |
| `exfiltration_service` | dangerous | `webhook.site`, `pastebin.com`, `requestbin.com`, `hastebin.com`, `dumpz.org`, `pipedream.net` |

~10 new `SecurityPattern` objects, following existing structure with `id`, `severity`, `category`, `pattern`, `description`.

**Code changes**: `security.ts` pattern array, plus corresponding tests.

## Acceptance Criteria

1. Agent occasionally suggests skill creation after complex workflows (via reviewer guidance)
2. `evolve-skill-writer` enforces frontmatter schema, category whitelist, and adds `trust: agent-created`
3. Reviewer calls `validate-skill` + `verify-skill` after every Write/Edit
4. Skills can contain `references/` and `templates/` auxiliary files (`.md`, `.txt`, `.yaml`, `.yml`, `.json` only)
5. All plugin-created skills have `trust: agent-created` in frontmatter
6. Security scan applies trust policy: dangerous patterns always blocked
7. `/evolve-skill-delete` command confirms and deletes a skill
8. Security scan covers all 14 categories (P0: prompt_injection, execution, secret, persistence, network, path_traversal, data_exfiltration, unicode = 8; P1: jailbreak, supply_chain, privilege_escalation, agent_config_tampering = 4; P2: crypto_mining, exfiltration_service = 2)

## Files Changed (Summary)

| File | Change | Feature |
|---|---|---|
| `src/lib/security.ts` | Add P2 patterns, trust policy, auxiliary path whitelist | F17, F20, F9-F10 |
| `src/commands/delete-skill.ts` | New handler | F8 |
| `src/runtime.ts` | Register `delete-skill`, add `--trust` flag to security-scan | F8, F20 |
| `agents/skill-reviewer.md` | Add skill guidance section, enforce validate/verify pipeline | F27, F5-F7 |
| `prompts/review-prompt.md` | Add skill guidance, enforce validate/verify | F27, F5-F7 |
| `prompts/review-prompt-combined.md` | Same | F27, F5-F7 |
| `prompts/review-prompt-skill.md` | Same (create only) | F27, F5 |
| `prompts/review-prompt-update.md` | Same (update + patch) | F27, F6-F7 |
| `skills/evolve-skill-writer/SKILL.md` | Add trust field, auxiliary file support | F20, F9-F10 |
| `commands/evolve-skill-delete.md` | New slash command | F8 |
| `src/__tests__/security.test.ts` | P2 pattern tests, trust policy tests, auxiliary path tests | F17, F20, F9-F10 |
| `src/__tests__/delete-skill.test.ts` | Delete skill command tests | F8 |
| `.claude-plugin/plugin.json` | Version bump | All |
