# P0: Reliability + Security

> Priority tier 0 — features that prevent the plugin from silently breaking or creating unsafe skills.

## Rationale

Counter reset and anti-nesting are reliability bugs (not enhancements) — without them, the nudge system miscounts and the review process can recurse. Threat patterns, structure checks, and Unicode detection are security fundamentals — the current 4-pattern scanner covers only 4 of 15 attack categories.

## In-Scope Features

### F1: Counter Reset on Skill Tool Use

**Problem:** Counter keeps incrementing even when the agent is already skill-aware, causing spurious nudges.

**Solution:** In `post-tool-use`, check if `tool_name` is `Skill` or `skill_manage` → reset counter to 0.

**Implementation:**
- Parse `PostToolUseInput` for `tool_name` field
- When `tool_name` matches skill-related tools, call `incrementCount()` with a reset flag or `saveState()` with count=0
- Hermes resets `_iters_since_skill` to 0 on `skill_manage` use

### F2: Anti-Nesting for Review Process

**Problem:** Review subprocess re-triggers all hooks (SessionStart, PostToolUse, Stop), causing double-counting and potential recursive reviews.

**Solution:** Pass `SELF_EVOLUTION_REVIEW_MODE=1` env var to spawned `claude -p`. Hooks check it and skip counting/nudging.

**Implementation:**
- In `spawner.ts`, add `SELF_EVOLUTION_REVIEW_MODE: "1"` to spawn env
- In `post-tool-use` command, check `process.env.SELF_EVOLUTION_REVIEW_MODE` — if set, exit early
- In `stop-gate` command, same check — if set, never spawn a review
- Hermes equivalent: sets two nudge intervals to 0 in the forked agent

### F2: Iteration Limits for Review Process

**Problem:** No limit on review process token consumption. A misbehaving review could run indefinitely.

**Solution:** Add `--max-turns` flag to spawned `claude -p` command.

**Implementation:**
- In `spawner.ts`, add `--max-turns 8` to the spawn arguments (matching Hermes's `max_iterations=8`)
- Make configurable via `config.yaml` → `review_max_turns` (default 8)

### F17: Threat Pattern Expansion (P0 Categories)

**Problem:** Current 4 patterns miss 11 attack categories. The 5 highest-risk categories are completely uncovered.

**Solution:** Add ~30 patterns for the 5 P0 categories.

**P0 Categories:**

| Category | Risk | Example Patterns |
|----------|------|-----------------|
| Persistence | High | `crontab`, `.bashrc` modification, `authorized_keys`, `systemd`, `launchd`, `at` command |
| Network attacks | High | Reverse shell (`/dev/tcp/`), tunnel (`ngrok`, `cloudflared`), hardcoded IP:port, `socat` |
| Execution | High | `subprocess`, `os.system`, `os.exec`, `child_process.exec`, `eval()` with user input |
| Path traversal | High | `../../../`, `/etc/passwd`, `/proc/self`, `/root/.ssh` |
| Data exfiltration | High | `curl $TOKEN`, `os.environ` to external, DNS exfil, Markdown image exfil (`![...](https://attacker.com/...`) |

**Implementation:**
- Refactor `security.ts` patterns into structured data: `{ id, severity, category, pattern, description }`
- Store patterns as an array of objects, scan iterates all patterns
- Each pattern has `severity: "dangerous" | "caution" | "safe"` for future trust policy integration
- Add base64-decoded scan for each new pattern (already done for existing 4)

### F18: Structure Checks

**Problem:** No check for binary files, symlinks, excessive file count/size. Malicious skill could include executables or symlinks pointing outside the skill directory.

**Solution:** Add structure validation in `security-scan`.

**Checks:**
- Reject binary files: `.exe`, `.dll`, `.so`, `.dylib`, `.bin`
- Reject symlinks pointing outside the skill directory
- File count limit: ≤50 per skill
- Total size limit: ≤1 MB per skill
- Single file size limit: ≤256 KB

**Implementation:**
- In `security-scan`, when path is a directory, scan its contents
- Check file extensions against binary blocklist
- Use `fs.lstat` to detect symlinks, resolve and check target is within skill dir
- Sum file sizes and count for limits

### F19: Invisible Unicode Detection

**Problem:** Zero-width/direction-override/BOM characters can alter skill rendering without visible changes. Attackers can embed hidden instructions.

**Solution:** Add Unicode pattern detection in `security-scan`.

**Detect:**
- Zero-width characters: U+200B, U+200C, U+200D, U+FEFF (BOM)
- Zero-width joiner/non-joiner: U+200D, U+200C
- Direction overrides: U+202A-U+202E (LTR/RTL embeds, overrides)
- Function application: U+2061, U+2062, U+2063, U+2064
- Other invisible: U+00AD (soft hyphen), U+034F (combining grapheme joiner)

**Implementation:**
- Add a `UNICODE_PATTERN` regex matching the above codepoints
- Scan skill content for matches
- Severity: `caution` (may be legitimate but suspicious)

## Out-of-Scope (Deferred)

| Feature | Tier | Reason |
|---------|------|--------|
| F16 verify-skill command | P1 | Depends on validation logic (F11, F12) |
| F20 trust framework | P2 | Meaningless without external skill sources |
| F17 remaining categories (jailbreak, supply chain, privilege escalation, agent config tampering, crypto mining, exfil services) | P1-P2 | Lower risk than P0 categories |

## Dependencies

None — all P0 features can be implemented independently.

## Acceptance Criteria

1. Counter resets to 0 when agent uses `Skill` tool
2. Review subprocess does not increment counter or trigger secondary review
3. Review subprocess terminates after N turns (configurable, default 8)
4. Security scan detects patterns in all 5 P0 categories (persistence, network, execution, path traversal, data exfil)
5. Security scan rejects binary files, symlinks outside skill dir, oversized skills
6. Security scan detects invisible Unicode characters
