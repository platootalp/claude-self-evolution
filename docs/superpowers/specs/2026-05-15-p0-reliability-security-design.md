# P0: Reliability + Security — Design Spec

> Priority 0 features to prevent silent plugin crashes and unsafe skill creation.

## Overview

Seven features across two domains:

- **Reliability (3):** F1 counter reset, F2 anti-nesting, F2 iteration limit
- **Security (4):** F17 threat pattern expansion, F18 structural checks, F19 Unicode detection

All features are independent with no cross-dependencies.

---

## F1: Counter Reset on Skill Tool Use

**Problem:** The counter increments on every tool use, including when the agent already has skill awareness via the Skill tool. This causes false nudges.

**Solution:** In `post-tool-use`, check `tool_name` before incrementing. When the agent uses the Skill tool, reset the counter to 0 instead of incrementing.

**Changes:**

- `src/commands/post-tool-use.ts`: Add early check — if `input.tool_name === "Skill"`, call `resetCount()` and return 0
- `src/lib/state.ts`: Add `resetCount(statePath, sessionId)` — loads state, sets session count to 0, saves state

**Note:** `skill_manage` is a Hermes-only concept. Only `"Skill"` (capital S) is relevant for Claude Code.

---

## F2: Review Process Anti-Nesting

**Problem:** The spawned review child process re-triggers all hooks (SessionStart, PostToolUse, Stop), causing double-counting and potentially recursive review spawning.

**Solution:** Pass `SELF_EVOLUTION_REVIEW_MODE=1` to the spawned process. Hooks detect this and skip counting/nudge/spawning.

**Changes:**

- `src/lib/spawner.ts`: Add `SELF_EVOLUTION_REVIEW_MODE: "1"` to spawn `env`
- `src/commands/post-tool-use.ts`: If `process.env.SELF_EVOLUTION_REVIEW_MODE === "1"`, return 0 immediately (no increment, no nudge)
- `src/commands/stop-gate.ts`: If `process.env.SELF_EVOLUTION_REVIEW_MODE === "1"`, return `{ action: "allow", spawned: false }` (never spawn review)

---

## F2: Review Iteration Limit

**Problem:** The review process has no token consumption cap. A malfunctioning review could run indefinitely.

**Solution:** Make `--max-turns` configurable with a safe default.

**Changes:**

- `src/lib/config.ts`: Add `review_max_turns: 8` to `Config` interface and `DEFAULT_CONFIG`. Add `SELF_EVOLUTION_REVIEW_MAX_TURNS` env var override.
- `src/lib/spawner.ts`: Change `--max-turns` from hardcoded `"20"` to use `config.review_max_turns` (default 8)

---

## F17: Threat Pattern Expansion (P0 Categories)

**Problem:** Current 4 regex patterns cover only 4 of 15 attack categories. The 5 highest-risk categories (persistence, network, execution, path traversal, data exfiltration) are completely uncovered.

**Solution:** Restructure all patterns into structured objects and add ~30 patterns for 5 P0 categories.

### Pattern Structure

```typescript
interface SecurityPattern {
  id: string;                              // e.g. "persist-crontab"
  severity: "dangerous" | "caution" | "safe";
  category: string;                        // e.g. "persistence"
  pattern: RegExp;
  description: string;
}
```

### Migrating Existing Patterns

The current 3 regex patterns become structured objects:

| Old constant | New id | category |
|-------------|--------|----------|
| `PI_PATTERN` | `pi-ignore-previous` | `prompt_injection` |
| `BASH_PATTERN` | `bash-rf-slash` | `execution` |
| `SECRET_PATTERN` | `secret-api-key` | `secret` |

### New P0 Patterns (~30)

**Persistence (6):**

| id | pattern | severity |
|----|---------|----------|
| persist-crontab | `crontab\s+` | dangerous |
| persist-bashrc | `\.(?:bashrc|zshrc|profile|bash_profile)\b` | dangerous |
| persist-authorized-keys | `authorized_keys` | dangerous |
| persist-systemd | `systemctl\s+(?:enable\|start\|create)` | dangerous |
| persist-launchd | `launchctl\s+(?:load\|start)` | dangerous |
| persist-at | `\bat\b\s+` | caution |

**Network (6):**

| id | pattern | severity |
|----|---------|----------|
| net-reverse-shell-tcp | `/dev/tcp/` | dangerous |
| net-reverse-shell | `(?:nc\|ncat\|netcat)\s+.*-[elv]` | dangerous |
| net-tunnel | `(?:ngrok\|cloudflared)\s+` | dangerous |
| net-hardcoded-ip | `\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}\b` | caution |
| net-socat | `socat\s+` | dangerous |
| net-nc-listen | `nc\s+-l` | dangerous |

**Execution (6):**

| id | pattern | severity |
|----|---------|----------|
| exec-subprocess | `subprocess\.(?:call\|run\|Popen\|check_output)` | dangerous |
| exec-os-system | `os\.system\s*\(` | dangerous |
| exec-os-exec | `os\.exec[a-z]+\s*\(` | dangerous |
| exec-child-process | `child_process\.exec(?:Sync)?\s*\(` | dangerous |
| exec-eval | `eval\s*\(` | caution |
| exec-popen | `(?:os\.)?popen\s*\(` | dangerous |

**Path Traversal (5):**

| id | pattern | severity |
|----|---------|----------|
| path-traversal-dot | `\.\.[\\/]` | dangerous |
| path-etc-passwd | `/etc/passwd` | dangerous |
| path-proc-self | `/proc/self` | dangerous |
| path-root-ssh | `/root/\.ssh` | dangerous |
| path-etc-shadow | `/etc/shadow` | dangerous |

**Data Exfiltration (7):**

| id | pattern | severity |
|----|---------|----------|
| exfil-curl-token | `curl.*\$\{?[A-Z_]+[A-Z_0-9]*\}?` | dangerous |
| exfil-environ-pipe | `os\.environ.*\|` | dangerous |
| exfil-dns | `(?:nslookup\|dig\|host)\s+.*\$` | dangerous |
| exfil-markdown-image | `!\[.*\]\(https?://[^)]*\$\{` | dangerous |
| exfil-env-log | `(?:console\.log\|print\|logger).*os\.environ` | dangerous |
| exfil-proc-environ | `/proc/self/environ` | dangerous |
| exfil-webhook-secret | `(?:webhook\|hook)\s+.*(?:token\|key\|secret\|password)` | dangerous |

### Scan Logic Changes

- Single `scanContent(content)` iterates all `SecurityPattern[]`, returns matches with severity and category
- Base64 decode scan applies to all patterns (not just the original 3)
- `SecurityScanResult` gains a `matches: SecurityMatch[]` field for per-category reporting
- Any `dangerous` match → `allowed: false`; any `caution` match → `allowed: true` but with warnings in reason

---

## F18: Structural Checks

**Problem:** No binary file, symlink, file count, or size checks. A malicious skill could contain executables or symlinks pointing outside the skill directory.

**Solution:** Add structural validation in `security-scan` when the scan path is a directory.

### Checks

| Check | Default | Config key | Env override |
|-------|---------|------------|-------------|
| Binary file rejection | `.exe`, `.dll`, `.so`, `.dylib`, `.bin`, `.sh`, `.bat`, `.cmd`, `.ps1`, `.com` | `binary_extensions` | — |
| Symlink target must be inside skill dir | — | — | — |
| Max files per skill | 50 | `max_files_per_skill` | `SELF_EVOLUTION_MAX_FILES_PER_SKILL` |
| Max total size per skill | 1 MB (1048576) | `max_skill_total_size` | `SELF_EVOLUTION_MAX_SKILL_TOTAL_SIZE` |
| Max single file size | 256 KB (262144) | `max_skill_file_size` | `SELF_EVOLUTION_MAX_SKILL_FILE_SIZE` |

**Note:** The existing `max_skill_size: 15360` (15 KB) applied only to single SKILL.md content. The new `max_skill_file_size: 262144` (256 KB) replaces it with a more generous but still safe limit. The old `max_skill_size` config key is deprecated in favor of `max_skill_file_size`.

### Implementation

- When `security-scan` receives a directory path, recursively walk its files using `fs.readdir` with `recursive: true`
- Check each file's extension against the binary blacklist
- Use `fs.lstat` to detect symlinks, resolve target, verify it's within the skill directory root
- Accumulate file count and total size, check against limits
- Any violation → `allowed: false` with descriptive reason

---

## F19: Invisible Unicode Detection

**Problem:** Zero-width, direction override, and BOM characters can change skill rendering behavior without changing visible content. Attackers could embed hidden instructions.

**Solution:** Add Unicode pattern detection as structured security patterns with category `"unicode"`.

### Detectable Code Points

| Code point | Name | severity |
|-----------|------|----------|
| U+200B | Zero-width space | caution |
| U+200C | Zero-width non-joiner | caution |
| U+200D | Zero-width joiner | caution |
| U+FEFF | BOM / zero-width non-breaking space | caution |
| U+202A-U+202E | Bidirectional overrides (LTR/RTL embed, override) | dangerous |
| U+2061-U+2064 | Function application | caution |
| U+00AD | Soft hyphen | caution |
| U+034F | Combining grapheme joiner | caution |

### Implementation

- Add as structured `SecurityPattern` entries with category `"unicode"`
- Unicode characters cannot hide inside base64, so scan raw content only (no base64 decode pass needed)
- Bi-directional overrides (U+202A-U+202E) are `dangerous` because they can flip text rendering to hide malicious content; all others are `caution`

---

## Acceptance Criteria

1. Agent using the `Skill` tool resets counter to 0 (no false nudge)
2. Review child process does not increment counters or trigger secondary reviews
3. Review child process terminates after N turns (configurable, default 8)
4. Security scan detects patterns in all 5 P0 categories (persistence, network, execution, path traversal, data exfiltration)
5. Security scan rejects binary files, symlinks outside skill dir, oversized skills
6. Security scan detects invisible Unicode characters

## Out of Scope

- F16 verify-skill command (P1, depends on F11/F12)
- F20 trust policy (P2, no external skill sources yet)
- F17 remaining categories: jailbreak, supply chain, privilege escalation, agent config tampering, crypto mining, exfil services (P1-P2)
