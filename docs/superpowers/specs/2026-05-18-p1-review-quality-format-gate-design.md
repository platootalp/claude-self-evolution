# P1: Review Quality + Format Gate — Design Spec

> Priority 1 — Improve review output quality and ensure generated skill format is correct.

## Overview

Eight features (F3, F4, F11, F12, F13, F14, F16, F17) that improve review prompt selection, add structured review output, validate skill format/naming/collisions, adjust size limits, add post-write verification, and extend threat pattern coverage.

## Architecture

### New Commands

| Command | File | Purpose |
|---------|------|---------|
| `validate-skill` | `src/commands/validate-skill.ts` | Pre-write format + naming + collision checks |
| `verify-skill` | `src/commands/verify-skill.ts` | Post-write security-scan + validate-skill wrapper |

### New Prompt Files

| File | Purpose |
|------|---------|
| `prompts/review-prompt-skill.md` | Focus on skill creation (non-trivial approach, trial-and-error, experiential findings, user expectation deviation) |
| `prompts/review-prompt-update.md` | Focus on skill update (outdated skill, new workflow contradicts existing skill) |
| `prompts/review-prompt-combined.md` | Both creation and update (fallback when uncertain) |

### Modified Files

| File | Changes |
|------|---------|
| `src/runtime.ts` | Route `validate-skill` and `verify-skill` commands |
| `src/lib/spawner.ts` | Add prompt selection logic based on existing skill overlap |
| `src/lib/security.ts` | Add P1 threat pattern categories (jailbreak, supply_chain, privilege_escalation, agent_config_tampering) |
| `src/commands/log-decision.ts` | Log `review_summary` event with action/name/rationale |
| `src/commands/status.ts` | Include latest review summary in output |
| `src/commands/stop-gate.ts` | No changes needed for P1 (reviewer already calls log-decision directly) |
| `prompts/review-prompt.md` | Retained as fallback, superseded by variant prompts |

---

## F11: YAML Frontmatter Format Validation

**Command:** `validate-skill --path <skill-path> --content <content>`

**Validation steps (fail-fast, in order):**

1. Content must start with `---` on line 1
2. Closing `---` must exist after the opening delimiter
3. YAML between delimiters must parse to a non-null object (not scalar or array)
4. `name` field: required, non-empty string
5. `description` field: required, non-empty string
6. Content after closing `---` must be non-empty (skill must have body, not just metadata)

**YAML parsing approach:** Regex-based frontmatter extraction (no external dependency). Split on `---` delimiters, parse `key: value` pairs for required fields. The format is constrained enough that a full YAML parser is unnecessary.

**Error format:** Each failed check appends a descriptive string to `errors[]`.

---

## F12: Naming Convention Validation

**Integrated into `validate-skill` command.**

**Rules:**
- `name` must match regex `^[a-z0-9][a-z0-9._-]*$`
- `name` max length: 64 characters
- `name` must match the directory name extracted from `--path`
  - e.g., `~/.claude/skills/foo-bar/SKILL.md` → directory name is `foo-bar` → `name` must be `foo-bar`

**Implementation:** Extract directory name via `path.basename(path.dirname(skillPath))`, compare against frontmatter `name`.

---

## F14: Cross-Directory Collision Detection

**Integrated into `validate-skill` command.**

**Logic:**
1. Scan `~/.claude/skills/` recursively for existing `SKILL.md` files
2. Extract `name` from each existing skill's frontmatter (lightweight: first `name:` line match)
3. If a skill with the same `name` exists at a different path:
   - `--mode create` (default): return error (block creation)
   - `--mode update`: return warning (allow update, collision is expected)

**CLI flag:** `--mode create|update` (default: `create`)

---

## F16: verify-skill Command (Post-Write Verification)

**Command:** `verify-skill --path <skill-path> --content <content>`

**Returns:** `{ verified: boolean, errors: string[] }`

**Flow:**
1. Run `security-scan` on path and content → if `!allowed`, add error(s) from `reason`
2. Run `validate-skill` on path and content → if `!valid`, add error(s)
3. Return combined result

**Reviewer integration:**
- After reviewer calls `Write` on a `SKILL.md`, it calls `verify-skill`
- If `!verified`, reviewer deletes the written file (soft rollback)
- The plugin provides the verification tool; the reviewer agent is the actor that executes cleanup

**Hermes comparison:** Hermes does post-write scan + automatic rollback (`_security_scan_skill` → `shutil.rmtree`). Since we can't hook into Claude Code's Write tool post-execution, we rely on the reviewer agent to call verify-skill and clean up. This is the "soft rollback" pattern: the plugin validates, the reviewer acts.

---

## F3: Multi-Prompt Review Strategy

**Three prompt variants in `prompts/`:**

### review-prompt-skill.md (creation focus)

Focus areas:
- Was a non-trivial approach used to complete a task?
- Did the task require trial and error, or changing course due to experiential findings?
- Did the user expect or desire a different method or outcome?
- Is the approach reusable across similar tasks?

### review-prompt-update.md (update focus)

Focus areas:
- Does an existing skill contain outdated or incorrect information?
- Did the conversation reveal a workflow that contradicts or extends an existing skill?
- Did the user correct or improve upon an existing skill's guidance?
- Are there missing steps, traps, or edge cases in an existing skill?

### review-prompt-combined.md (both)

Covers both creation and update focus areas. Used when the spawner cannot determine which is more appropriate.

**Prompt selection logic in `spawner.ts`:**

1. Before spawning, read existing skills list from `~/.claude/skills/`
2. For each existing skill, extract name and description keywords
3. Compare keywords against transcript user messages (case-insensitive, words >3 chars)
4. Decision:
   - Overlap found (any keyword match) → `review-prompt-update.md`
   - No overlap → `review-prompt-skill.md`
   - Uncertain (error reading skills, empty transcript) → `review-prompt-combined.md`
5. Fallback: if selected prompt file doesn't exist, use `review-prompt.md` (current single prompt)

**Keyword matching heuristic (following Hermes pattern):**
- Hermes uses trigger type (skill nudge vs memory nudge) to select prompt
- Self-evolution has no memory nudge, so overlap detection replaces trigger type
- Simple substring matching on skill name/description words vs transcript content
- No LLM-based classification (avoids added latency and complexity)

---

## F4: Structured Review Output

**Flow:**
1. Reviewer process completes and writes decision via `log-decision`
2. `log-decision` already captures `CREATED/UPDATED/SKIPPED` with detail
3. Add `review_summary` event logging: `{ action, name, rationale }`
4. `status` command includes latest review summary from `stats.recent_decisions`

**Implementation in `log-decision.ts`:**
- When decision is CREATED/UPDATED/SKIPPED, also log a `review_summary` event via `logEvent`
- Extract action from decision, name from detail, rationale from detail

**Implementation in `status.ts`:**
- Include `latest_review` field in output: `{ action, name, rationale, timestamp }`
- Sourced from the most recent entry in `stats.recent_decisions`

**Note:** Claude Code hooks may not support returning data to the main session, so the summary is written to logs and the `status` command, not directly displayed to the user (as noted in the spec).

---

## F13: Size Limit Adjustments

**Current config defaults (post-P0):**

| Key | Current Value | P1 Spec Target | Action |
|-----|--------------|----------------|--------|
| `max_skill_file_size` | 262144 (256 KB) | 100,000 chars | **No change** — 256 KB > 100K chars, already more generous |
| `max_skill_total_size` | 1048576 (1 MB) | 1 MB | Already correct |
| `max_files_per_skill` | 50 | 50 | Already correct |

**Rationale for no change:** The P0 refactor already replaced `max_skill_size` (15KB) with `max_skill_file_size` (256KB). The P1 spec's 100,000 character limit is approximately 100-300KB depending on encoding, which is within the current 256KB limit. The current defaults are already aligned with or more generous than the P1 spec requirements.

---

## F17: P1 Threat Pattern Categories

**Four new categories added to `SECURITY_PATTERNS` in `src/lib/security.ts`:**

### 1. Jailbreak (severity: `dangerous`)

| Pattern | Description |
|---------|-------------|
| `DAN mode` | "Do Anything Now" jailbreak |
| `developer mode` | Developer mode activation |
| `STAN` | "Strictly Think And Narrate" jailbreak |
| `jailbreak` | Direct jailbreak keyword |
| `respond without safety filters` | Safety filter bypass |
| `bypass safety` | Safety bypass request |
| `you are now unrestricted` | Unrestricted mode activation |
| `act as if you have no rules` | Rule suspension request |
| `ignore your guidelines` | Guideline bypass |

### 2. Supply Chain (severity: mixed `dangerous`/`caution`)

| Pattern | Severity | Description |
|---------|----------|-------------|
| `curl \| sh`, `curl \| bash` | dangerous | Piped remote execution |
| `pip install` without `==` | caution | Unpinned package install |
| `npm install -g` from untrusted | caution | Global npm install |
| `git clone` into executable path | caution | Clone to executable location |
| `uv run` | caution | Unpinned uv execution |
| Remote fetch without hash | caution | Unverified remote content |

### 3. Privilege Escalation (severity: `dangerous`)

| Pattern | Description |
|---------|-------------|
| `allowed-tools` injection | Injecting tool permissions |
| `sudo` in commands | Elevation via sudo |
| `setuid`/`setgid` | SUID bit manipulation |
| `chmod +s` | Setting SUID/SGID bits |
| `NOPASSWD` | Passwordless sudo |

### 4. Agent Config Tampering (severity: `dangerous`)

| Pattern | Description |
|---------|-------------|
| `AGENTS.md` modification | Altering agent behavior config |
| `CLAUDE.md` modification | Altering Claude instructions |
| `.claude/` config modification | Modifying plugin/hook settings |
| `settings.json` modification | Changing Claude Code settings |
| `settings.local.json` modification | Changing local settings |

**Total: ~20 new patterns** extending the existing P0 infrastructure.

**Pattern structure:** Each pattern follows the existing `SecurityPattern` interface: `{ id, severity, category, pattern (regex), description }`.

---

## Runtime Command Routing

Add to `src/runtime.ts`:

```
case 'validate-skill':
  // Parse --path, --content, --mode from args
  // Call validateSkill(path, content, mode)
  // Output JSON result

case 'verify-skill':
  // Parse --path, --content from args
  // Call verifySkill(path, content)
  // Output JSON result
```

---

## Reviewer Agent Integration

Update `prompts/review-prompt-*.md` to include:

1. After calling `Write` on a SKILL.md, call `node runtime.mjs verify-skill --path <path> --content <content>`
2. If `verified: false`, delete the written file and output `SKIPPED: verification_failed: <errors>`
3. This replaces the current security-scan-only pre-write check with a more comprehensive post-write verification

---

## Testing Strategy

Each new command gets its own test file:

| Test File | Coverage |
|-----------|----------|
| `validate-skill.test.ts` | Frontmatter format (valid/invalid YAML, missing fields, no body), naming regex, name-dir mismatch, collision detection (create vs update mode) |
| `verify-skill.test.ts` | Security scan failure, validation failure, both pass, combined errors |
| `spawner.test.ts` (updated) | Prompt selection logic (overlap → update, no overlap → create, fallback → combined) |
| `security.test.ts` (updated) | New P1 pattern categories (jailbreak, supply chain, privilege escalation, agent config tampering) |
| `log-decision.test.ts` (updated) | Review summary event logging |
| `status.test.ts` (updated) | Latest review summary in output |

---

## Dependencies

- F16 (verify-skill) depends on F11 + F12 (validation logic must exist first)
- F17 P1 patterns depend on existing P0 pattern infrastructure (already in place)
- F3 prompt variants are independent of other features
- F4 review output is independent of other features

## Acceptance Criteria

1. Reviewer uses different prompts based on context (create vs update vs combined)
2. One-line review summary appears in session log and `status` command output
3. `validate-skill` rejects malformed frontmatter, invalid names, name collisions
4. Size limits (256KB/1MB/50 files) are enforced
5. `verify-skill` catches post-write issues and triggers reviewer cleanup
6. Security scan covers 9 of 15 categories (P0 + P1)
