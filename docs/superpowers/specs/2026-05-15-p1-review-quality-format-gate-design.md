# P1: Review Quality + Format Gate

> Priority tier 1 — features that improve the quality of what the review process produces and ensure generated skills are well-formed.

## Rationale

Multi-prompt and structured output make reviews more targeted and observable. Frontmatter/naming/collision validation ensures generated skills are well-formed and don't conflict with existing ones. The verify-skill command provides a post-write safety net. P1 threat patterns fill in the remaining high-risk gaps.

## In-Scope Features

### F3: Multi-Prompt Review Strategy

**Problem:** Single `review-prompt.md` can't distinguish "should I create a new skill?" from "should I update an existing one?" Hermes uses 3 prompt variants.

**Solution:** Add prompt variants; spawner selects based on context.

**Prompts:**
- `review-prompt-skill.md` — focused on skill creation (non-trivial methods, trial-and-error, empirical discoveries, user expectation gaps)
- `review-prompt-update.md` — focused on skill updates (existing skill is outdated, new workflow contradicts existing skill)
- `review-prompt-combined.md` — when both creation and update are relevant

**Implementation:**
- Create 3 prompt files in `prompts/`
- In `spawner.ts`, before spawning, check if any existing skills overlap with the transcript topic
- Select appropriate prompt; fall back to combined if uncertain
- Reviewer agent's `maxTurns` and `effort` stay the same

### F4: Structured Review Output

**Problem:** Review results only go to JSONL files, never shown to user. User has no visibility into what the plugin did.

**Solution:** In stop-gate job callback, parse review output and log a one-line summary.

**Implementation:**
- After review subprocess completes, parse its stdout for `CREATED:`, `UPDATED:`, `SKIPPED:` patterns
- Log summary via `logEvent("review_summary", { action, name, rationale })`
- In `status` command, include latest review summary in output
- Note: Claude Code hooks may not support returning data to the main session, so the summary goes to logs and `status` command rather than directly to the user

### F11: Frontmatter Format Validation

**Problem:** No validation — malformed SKILL.md files silently fail at load time.

**Solution:** New `validate-skill` command that parses and validates frontmatter.

**Validation rules:**
- Must start with `---` on line 1
- Must have closing `---` after YAML block
- YAML must parse as a dict (not scalar/array)
- `name` field: required, non-empty string
- `description` field: required, non-empty string
- Body must exist after closing `---`

**Implementation:**
- New command in `src/commands/validate-skill.ts`
- Use a lightweight YAML parser (or simple regex for the frontmatter block)
- Return `{ valid: boolean, errors: string[] }`
- Reviewer calls `validate-skill` after Write in the review flow

### F12: Naming Convention Validation

**Problem:** Non-standard names cause load issues. No validation exists.

**Solution:** In `validate-skill`, add naming regex check.

**Validation rules:**
- Regex: `^[a-z0-9][a-z0-9._-]*$`
- Max length: 64 characters
- Must match the directory name (i.e., skill at `~/.claude/skills/foo-bar/SKILL.md` must have `name: foo-bar`)

**Implementation:**
- Part of `validate-skill` command
- Extract `name` from frontmatter, validate against regex
- Extract directory name from path, verify consistency

### F13: Size Limit Adjustment

**Problem:** Current `max_skill_size` default is 15KB — too conservative vs Hermes's 100K characters. No total-size or file-count limits.

**Solution:** Adjust defaults and add limits.

**New defaults:**
- `max_skill_size`: 100,000 characters (up from 15,360 bytes)
- `max_total_size`: 1,048,576 bytes (1 MB) per skill directory
- `max_file_count`: 50 per skill directory
- `max_single_file`: 262,144 bytes (256 KB)

**Implementation:**
- Update `config.ts` defaults
- Update `security-scan` to check total size and file count when path is a directory
- Add `max_total_size`, `max_file_count`, `max_single_file` to config schema

### F14: Cross-Directory Collision Detection

**Problem:** Creating a skill with the same name as an existing one silently overwrites.

**Solution:** In `validate-skill`, scan for name conflicts.

**Implementation:**
- Scan `~/.claude/skills/` directories
- If a skill with the same `name` already exists (in a different directory), return warning
- For CREATE operations: collision is an error (block)
- For UPDATE operations: collision is expected (allow)

### F16: verify-skill Command (Post-Write Validation)

**Problem:** Pre-write gate can't catch issues introduced during the write itself. No post-write verification.

**Solution:** New `verify-skill` command that runs security-scan + validate-skill after write.

**Implementation:**
- New command in `src/commands/verify-skill.ts`
- Calls `security-scan` on the written path
- Calls `validate-skill` on the written content
- If either fails, returns `{ verified: false, errors: [...] }`
- Reviewer calls `verify-skill` after Write, and if verification fails, deletes the written file
- This is the "soft rollback" mechanism: reviewer does the cleanup, not the plugin

### F17: Threat Pattern Expansion (P1 Categories)

**Problem:** 5 more attack categories remain uncovered after P0.

**P1 Categories:**

| Category | Risk | Example Patterns |
|----------|------|-----------------|
| Jailbreak | Medium | "DAN mode", "developer mode", "STAN", "jailbreak", role-hijacking phrases |
| Supply chain | Medium | `curl \| sh`, `pip install` without version pin, `npm install -g` from untrusted, `git clone` into executable path |
| Privilege escalation | Medium | `allowed-tools` injection, `sudo` in commands, `setuid`, `chmod +s` |
| Agent config tampering | Medium | Modification of `AGENTS.md`, `CLAUDE.md`, `.claude/` config files |

**Implementation:**
- Add ~20 patterns to the structured pattern array (extending P0 infrastructure)
- Severity: mix of `dangerous` and `caution`

## Out-of-Scope (Deferred)

| Feature | Tier | Reason |
|---------|------|--------|
| F20 trust framework | P2 | Meaningless without external skill sources |
| F17 remaining categories (crypto mining, exfil services) | P2 | Lower risk |
| F5-F7 skill CRUD | P2 | Enhanced delegation route chosen |
| F15 atomic writes | P2 | Only relevant with own CRUD layer |

## Dependencies

- F16 (verify-skill) depends on F11 + F12 (validation logic must exist first)
- F17 P1 patterns depend on F17 P0 pattern infrastructure (structured pattern array)

## Acceptance Criteria

1. Reviewer uses different prompts based on context (new skill vs update vs combined)
2. One-line review summary appears in session log and `status` command output
3. `validate-skill` rejects malformed frontmatter, invalid names, name collisions
4. `max_skill_size` default is 100,000; total-size, file-count, single-file limits enforced
5. `verify-skill` catches post-write issues and triggers reviewer cleanup
6. Security scan covers 9 of 15 categories (P0 + P1)
