# P2: Enhanced CRUD + Guidance

> Priority tier 2 — features that enhance the plugin's ability to create and manage skills beyond the basic write path, and make the agent proactively suggest skill creation.

## Rationale

Behavior guidance makes the agent proactively suggest skill creation/update. The enhanced delegation route adds more control over skill operations without building a parallel CRUD system. Trust framework becomes meaningful once external sources exist. Auxiliary file support enables richer skills.

## Key Design Decision: Route B (Enhanced Delegation) for CRUD

Rather than building a parallel CRUD system that could conflict with Claude Code's built-in Skill tool, we enhance the existing delegation model:

1. `evolve-skill-writer` meta-skill gets stricter format rules
2. `validate-skill` command (from P1) provides post-write verification
3. `security-scan` path whitelist expands for auxiliary files
4. Reviewer prompt includes quality checklist

This avoids platform conflicts and keeps implementation cost low, at the expense of relying on the agent following guidance (vs programmatic guarantees).

## In-Scope Features

### F27: Behavior Guidance (System Prompt)

**Problem:** Agent never proactively suggests creating or updating skills. The plugin only reacts at Stop time via nudge.

**Solution:** Add guidance to make the agent suggest skill creation after complex workflows.

**Implementation:**
- Add a "Skills Guidance" section to `agents/skill-reviewer.md` that tells the reviewer to:
  - Proactively suggest saving a skill after complex multi-step workflows
  - Suggest updating an existing skill when workflow contradicts it
  - Reference the `evolve-skill-writer` meta-skill for generation
- Optionally: in `session-start` hook, output a one-line guidance message (evaluated for feasibility — may be too noisy)

### F28: Tool Schema Description Guidance

**Problem:** Can't modify Claude Code's built-in `Skill` tool schema to embed creation/update triggers.

**Solution:** Document as a platform limitation. Indirect guidance through review-prompt.md quality standards and the `evolve-skill-writer` meta-skill.

**Implementation:**
- No code changes — this is a documentation note
- The `evolve-skill-writer` meta-skill's description already includes trigger phrases ("Use this skill whenever...")
- Future: if the plugin builds its own `skill-manage` tool, embed guidance in its schema description

### F5-F7: Skill CRUD (Enhanced Delegation)

**Problem:** No programmatic control over create/edit/patch quality. All operations depend on the agent following the meta-skill's guidance.

**Solution (Route B):** Enhance the existing delegation model with stronger guardrails.

**Enhancements:**
- **Create (F5):** `evolve-skill-writer` meta-skill already handles this. Enhance with:
  - Mandatory `validate-skill` call after Write
  - Category whitelist enforcement (already exists)
  - Frontmatter schema enforcement (from P1 F11)
- **Edit (F6):** Currently full rewrite. Enhance with:
  - Reviewer prompt instructs agent to read existing skill first
  - `evolve-skill-writer` in update mode increments version (already exists)
  - Post-edit `validate-skill` + `verify-skill` call
- **Patch (F7):** Currently not supported. Add:
  - Reviewer prompt can instruct agent to make targeted edits
  - Claude Code's Edit tool handles the actual patching
  - Post-patch `verify-skill` call
  - No fuzzy matching (unlike Hermes) — rely on Claude Code's Edit tool for content matching

**What we don't build:**
- No `skill_manage` tool (would conflict with Claude Code's `Skill` tool)
- No fuzzy matching library
- No atomic write layer (delegated to Claude Code's Write/Edit tools)

### F8: Skill Delete

**Problem:** No way to delete a skill created by the plugin.

**Solution:** Add `/evolve-skill-delete` slash command.

**Implementation:**
- New command in `commands/evolve-skill-delete.md`
- Validates skill exists at `~/.claude/skills/<name>/`
- Confirms with user (slash command is interactive)
- Removes the skill directory via `rm -rf`
- Logs deletion via `log-decision` with action `DELETED`

### F9-F10: Auxiliary File Management

**Problem:** Skills can only contain SKILL.md. Can't include `references/`, `templates/`, or scripts.

**Solution:** Extend security-scan path whitelist and update evolve-skill-writer.

**Allowed auxiliary paths:**
- `~/.claude/skills/<name>/SKILL.md` (existing)
- `~/.claude/skills/<name>/references/**` (new)
- `~/.claude/skills/<name>/templates/**` (new)

**Not allowed:**
- Arbitrary file types or paths outside the skill directory
- Executable scripts (security risk)

**Implementation:**
- Update `scanWrite` path whitelist in `security.ts`
- Add file type restrictions: only `.md`, `.txt`, `.yaml`, `.yml`, `.json` allowed in auxiliary dirs
- Update `evolve-skill-writer` meta-skill to mention auxiliary file support
- Structure checks from P0 (F18) apply: file count ≤50, total size ≤1MB

### F15: Atomic Writes

**Problem:** Skill writes via Claude Code's Write tool have no atomicity guarantee. Mid-write crash could produce a half-written file.

**Solution:** In the enhanced delegation model, this is a platform dependency. Claude Code's Write tool handles writes. If we build our own CRUD layer in the future, we'd implement `tempfile + rename`.

**Implementation:**
- No code changes in P2
- Document as known limitation
- The `verify-skill` command (P1) provides a soft safety net: if a write is corrupted, verification fails and the reviewer can retry

### F20: Trust Framework (Agent-Created Level)

**Problem:** All skills are treated equally regardless of source. No way to apply different security policies based on trust.

**Solution:** Short-term: mark all plugin-created skills as `agent-created` trust level and apply a basic policy.

**Trust levels (short-term, 1 level):**

| Level | safe | caution | dangerous |
|-------|------|---------|-----------|
| agent-created | allow | allow | block |

**Implementation:**
- `evolve-skill-writer` meta-skill adds `trust: agent-created` to frontmatter
- `security-scan` reads the `trust` field and applies policy:
  - `safe` severity patterns: always allow
  - `caution` severity patterns: allow for agent-created
  - `dangerous` severity patterns: always block
- Future: add `community` and `trusted` levels when Hub (F26) is implemented

### F17: Threat Pattern Expansion (P2 Categories)

**Problem:** 2 remaining attack categories after P0+P1.

**P2 Categories:**

| Category | Risk | Example Patterns |
|----------|------|-----------------|
| Crypto mining | Low | `xmrig`, `monero`, `stratum+tcp`, `minerd`, `cpuminer` |
| Exfiltration services | Low | `webhook.site`, `pastebin.com`, `requestbin.com`, `hastebin.com` |

**Implementation:**
- Add ~10 patterns to the structured pattern array
- Severity: `dangerous` for both categories

## Out-of-Scope (Deferred)

| Feature | Tier | Reason |
|---------|------|--------|
| F26 Hub external installation | P3 | Blocked on ecosystem infrastructure |
| F21 LRU index cache | P3 | Likely unnecessary; Claude Code handles skill loading |
| F5-F7 own CRUD layer (Route A) | Deferred | Enhanced delegation (Route B) is the chosen approach |

## Dependencies

- F5-F7 depends on F11 + F12 (validation from P1)
- F20 depends on frontmatter having a `trust` field (F11)
- F9-F10 depends on security-scan path whitelist changes (F18 from P0)
- F17 P2 patterns depend on P0 pattern infrastructure

## Acceptance Criteria

1. Agent occasionally suggests skill creation after complex workflows (via reviewer guidance)
2. `evolve-skill-writer` enforces frontmatter schema and category whitelist
3. Reviewer calls `validate-skill` + `verify-skill` after every Write/Edit
4. Skills can include `references/` and `templates/` auxiliary files (only `.md`, `.txt`, `.yaml`, `.yml`, `.json`)
5. All plugin-created skills have `trust: agent-created` in frontmatter
6. Security scan applies trust policy: dangerous patterns always blocked
7. `/evolve-skill-delete` command removes a skill after confirmation
8. Security scan covers all 15 categories (P0 + P1 + P2)
