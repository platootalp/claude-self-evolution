# P3: Ecosystem

> Priority tier 3 — ecosystem-level features that go beyond what a single plugin should implement. Documented for awareness, not for immediate implementation.

## Rationale

These features are either already handled by the platform, blocked on ecosystem infrastructure, or low priority. They're documented here so nothing is silently dropped from the gap analysis.

## Feature Inventory

### F26: Hub External Installation

**Status:** Blocked by ecosystem

**Description:** Install skills from external sources (GitHub, ClawHub, Marketplace). Includes quarantine + security scanning and per-source trust policies.

**Why blocked:** Requires a skill registry/marketplace to exist. The security model (quarantine → scan → trust-level assignment) is designed in the gap analysis but depends on Hub infrastructure.

**Future implementation sketch (if Hub becomes available):**
- Add `evolve-skill-install` slash command
- Download skill to quarantine directory
- Run full security scan (all 15 categories)
- Assign trust level based on source: `builtin` (Claude Code built-in), `trusted` (official Hub), `community` (third-party)
- Move to `~/.claude/skills/` if scan passes
- Apply trust policy per F20

### F21: Skill Index Cache (LRU + Disk)

**Status:** Likely unnecessary

**Description:** Dual-layer cache: in-process LRU (8 entries) + disk snapshot. Manifest validity check via mtime + size. Skill operations clear cache.

**Why likely unnecessary:** Claude Code's built-in Skill loading appears fast enough. Only implement if profiling shows skill discovery is a bottleneck.

**If needed:**
- Add LRU cache in `state.ts` or a new `cache.ts`
- Cache key: skill name, value: parsed frontmatter + mtime + size
- Invalidate on create/update/delete operations

### F22: Slash Command Scanning & Registration

**Status:** Already handled by platform

**Description:** Scan skill directory, register `/skill-name` commands for each skill.

**Why no action needed:** Claude Code's built-in mechanism automatically registers `/skill-name` commands for skills in `~/.claude/skills/`. The plugin's own commands (`/evolve-review`, `/evolve-status`) are already registered via the `commands/` directory.

### F23: Template Variable Replacement

**Status:** Platform responsibility

**Description:** Replace `${SKILL_DIR}`, `${SESSION_ID}` etc. in skill content at load time.

**Why no action needed:** This is a Skill-loading feature that Claude Code's Skill system should handle. If Claude Code adds template variable support, skills can use it. No plugin action needed.

### F24: Inline Shell Expansion

**Status:** Low priority / security concern

**Description:** Expand `` !`cmd` `` inline shell commands in skill content at load time.

**Why deferred:** Shell expansion in skills is a significant security risk. Only consider if Claude Code supports it natively with proper sandboxing. The plugin's security model would need to scan for dangerous shell commands within expansion syntax.

### F25: Config Injection

**Status:** Platform responsibility

**Description:** Inject values from `config.yaml` into skill templates at load time.

**Why no action needed:** This is a Skill-loading feature that Claude Code's Skill system should handle. If Claude Code adds config injection, leverage it. No plugin action needed.

## Summary

| F# | Feature | Action |
|---|---------|--------|
| F26 | Hub external installation | Blocked on ecosystem. Future: implement when Hub exists. |
| F21 | Skill index cache | Likely unnecessary. Only if profiling shows bottleneck. |
| F22 | Slash command scanning | No action. Handled by Claude Code. |
| F23 | Template variable replacement | No action. Platform responsibility. |
| F24 | Inline shell expansion | Deferred. Security concern. |
| F25 | Config injection | No action. Platform responsibility. |

No acceptance criteria for P3 — these are documented for awareness, not for implementation planning.
