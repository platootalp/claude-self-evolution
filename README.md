# self-evolution

> Auto-curate `~/.claude/skills/` from your conversations.

**Version:** 0.4.0
**License:** MIT
**Compatible with:** Claude-Code v1.0.0+
**Status:** Stable (v4 production release)

---

## What it does

The self-evolution plugin automatically extracts reusable workflows from your conversations and converts them into well-structured Claude skills. It runs in two modes:

- **Auto mode**: Triggers automatically via Stop hook when the session ends (every 10 tool calls by default)
- **Manual mode**: Review and extract workflows on-demand via `/evolve-review` command

The system uses a three-layer hard gating mechanism for safety and a meta-skill (evolve-skill-writer) for consistent skill generation.

### Key Features

- **Automatic extraction**: No manual intervention required in auto mode
- **Hard-gated security**: Three-layer defense against bad content (frequency gate, path whitelist, content scanner)
- **Meta-skill generation**: Uses evolve-skill-writer to ensure consistent, well-formed SKILL.md files
- **JSONL logging**: All decisions and actions logged for auditability
- **Rollback support**: Easy state reset and plugin rollback

---

## Two paths: Auto vs Manual

| Feature | Auto Mode (Stop Hook) | Manual Mode (/evolve-review) |
|---------|----------------------|-------------------------------|
| **Trigger** | Session ends after ≥10 tool calls | User runs command during or after session |
| **Workflow** | `PostToolUse → Stop hook → AgentHook (90s)` → skill creation | `/evolve-review` → skill-reviewer agent → meta-skill |
| **Timeout** | 90s total (hook timeout) | No hard timeout (agent mode) |
| **User visibility** | Silent (no blocking) | Interactive (shows decision log) |
| **Use case** | "Set it and forget it" | On-demand extraction after a good conversation |
| **Config** | `nudgeIntervalToolCalls` setting | Command-line flags |
| **Safety** | Same three-layer hard gates apply | Same three-layer hard gates apply |

**When to use which:**

- Use **auto mode** for daily development work where you want skills captured without thinking about it
- Use **manual mode** when you just had a particularly good workflow and want to ensure it's captured immediately

---

## Three-layer hard gating

Self-evolution applies defense-in-depth to prevent bad skills from entering your repository:

### Layer 1: Frequency gate (L1)

- **Purpose**: Prevents excessive hook execution and noisy skill generation
- **Mechanism**: Tracks tool calls per session; only triggers when `nudgeIntervalToolCalls` threshold (default: 10) is reached
- **Config**: `settings.nudgeIntervalToolCalls` in plugin.json or env override `SELF_EVOLUTION_NUDGE_INTERVAL`
- **Bypass**: None (hard gate)

### Layer 2: Path whitelist (L4)

- **Purpose**: Restricts skill installation to safe locations
- **Mechanism**: security-scan.sh validates all paths before skill creation
- **Allowed paths**:
  - `~/.claude/skills/` (user skill directory)
  - `~/.claude/plugins/` (plugin directory)
  - Generic project paths (e.g. `./src/`, `${PROJECT_ROOT}/...`)
- **Blocked paths**:
  - `~/.ssh/`, `~/.aws/`, `~/.bashrc`, `~/.zshrc`
  - `/etc/`, `/var/`, `/usr/`
  - System configuration files
- **Bypass**: None (hard gate)

### Layer 3: Content scanner (L5)

- **Purpose**: Detects dangerous patterns in generated skill content
- **Mechanism**: security-scan.sh scans SKILL.md content before Write/Edit operations
- **Detects**:
  - Prompt injection: "ignore previous instructions", "you are now..."
  - Base64-encoded injection (length ≥20 tokens)
  - Dangerous bash: `rm -rf /`, `curl ... | sh`, `eval $(...)`
  - Secret leaks: API keys, tokens, private keys, passwords
  - File size violations: >15KB (configurable via `maxSkillSizeBytes`)
- **Response**: Returns error and aborts the operation
- **Bypass**: None (hard gate)

**Notes:**
- All three layers run in sequence; failure at any layer stops the pipeline
- Security events are logged to JSONL for audit trail
- The meta-skill (evolve-skill-writer) also performs a self-check (redundant with L3)

---

## Install

### Step 1: Add plugin from local file

In Claude-Code:

```bash
/plugin marketplace add file:///Users/lijunyi/road/harness-code/.worktrees/self-evolution-v4/claude-self-evolution
```

**Note on path replacement (F27):**
- Replace `/Users/lijunyi/road/harness-code/.worktrees/self-evolution-v4` with your actual repository path
- The path must be absolute; relative paths don't work with file:// URIs
- On Windows, use forward slashes: `file:///C:/Users/yourname/repo/claude-self-evolution`

### Step 2: Install plugin

```bash
/plugin install self-evolution
```

### Step 3: Verify installation

```bash
/plugin list
```

You should see `self-evolution v0.4.0` in the installed plugins list.

### Optional: Configure settings

Edit `~/.claude/plugins/self-evolution/plugin.json` or set environment variables:

```bash
export SELF_EVOLUTION_NUDGE_INTERVAL=15  # Trigger every 15 tool calls instead of 10
export SELF_EVOLUTION_CATEGORY_WHITELIST="debug refactor test"  # Only generate these categories
```

---

## Configuration

All settings can be configured via `plugin.json` or environment variables:

| Setting | Default | Description | Environment Variable |
|---------|---------|-------------|----------------------|
| `nudgeIntervalToolCalls` | 10 | Tool calls between auto-trigger events | `SELF_EVOLUTION_NUDGE_INTERVAL` |
| `skillTargetScope` | "user" | Where to install skills: "user" (~/.claude/skills/) or "plugin" (self-evolution/skills/) | `SELF_EVOLUTION_TARGET_SCOPE` |
| `categoryWhitelist` | ["debug","refactor","test","deploy","data","web","cli","meta"] | Allowed skill categories (enforced by meta-skill) | `SELF_EVOLUTION_CATEGORY_WHITELIST` |
| `maxSkillSizeBytes` | 15360 | Maximum size of generated SKILL.md files | `SELF_EVOLUTION_MAX_SKILL_SIZE` |
| `reviewerModel` | "inherit" | Model used by skill-reviewer agent: "inherit" (use session model) or specific model name | `SELF_EVOLUTION_REVIEWER_MODEL` |
| `metaSkillName` | "evolve-skill-writer" | Name of meta-skill that generates SKILL.md content | N/A |

**Example plugin.json:**

```json
{
  "name": "self-evolution",
  "version": "0.4.0",
  "settings": {
    "nudgeIntervalToolCalls": 15,
    "skillTargetScope": "user",
    "categoryWhitelist": ["debug", "refactor", "test"],
    "maxSkillSizeBytes": 20480,
    "reviewerModel": "claude-3-5-sonnet",
    "metaSkillName": "evolve-skill-writer"
  }
}
```

**Environment variable override priority:**
Environment variables override plugin.json settings at runtime. This is useful for per-session adjustments without editing files.

---

## Monitoring & Logs (F7/F26)

### JSONL logging structure

All decisions and security events are logged to `data/self-evolution.jsonl` in the plugin directory:

```json
{"timestamp":"2026-05-09T12:34:56Z","level":"info","event":"nudge_state","data":{"tool_calls":10,"decision":"trigger"}}
{"timestamp":"2026-05-09T12:35:12Z","level":"info","event":"skill_created","data":{"name":"debug-fastapi-5xx","path":"/Users/you/.claude/skills/debug-fastapi-5xx/SKILL.md"}}
{"timestamp":"2026-05-09T12:35:45Z","level":"warn","event":"security_scan","data":{"reason":"prompt_injection","blocked_content":"ignore previous instructions"}}
```

### Log rotation (F45)

Logs are automatically rotated to prevent disk bloat:

- **Max file size**: 10MB
- **Max backup files**: 5
- **Rotation strategy**: Timestamp-based (e.g., `self-evolution.jsonl.2026-05-09T12:34:56Z`)
- **Cleanup**: Oldest backups are deleted when limit exceeded

### Health checks with jq

Monitor plugin health from the command line:

```bash
# Check recent decision rate (last 24 hours)
cat ~/.claude/plugins/self-evolution/data/self-evolution.jsonl | \
  jq -r 'select(.timestamp >= now - 86400) | .event' | \
  sort | uniq -c

# Check security events
cat ~/.claude/plugins/self-evolution/data/self-evolution.jsonl | \
  jq -r 'select(.level == "warn")'

# Check skill creation success rate
cat ~/.claude/plugins/self-evolution/data/self-evolution.jsonl | \
  jq -r 'select(.event == "skill_created")' | \
  wc -l
```

### Log locations

- **Plugin logs**: `~/.claude/plugins/self-evolution/data/self-evolution.jsonl`
- **Rotated backups**: `~/.claude/plugins/self-evolution/data/self-evolution.jsonl.*`
- **Hook execution logs**: Merged into Claude-Code's main hook logs (accessible via `/log` command)

---

## Troubleshooting

### Disable the plugin temporarily

To disable self-evolution without uninstalling:

```bash
# Disable auto mode (Stop hook won't trigger)
/plugin disable self-evolution

# Or set a very high nudge interval
export SELF_EVOLUTION_NUDGE_INTERVAL=999999

# To re-enable
/plugin enable self-evolution
```

### Reset plugin state

If the plugin gets stuck in a bad state:

```bash
# Run the reset-state script
cd ~/.claude/plugins/self-evolution
./scripts/reset-state.sh --apply

# This removes:
# - data/nudge-state.json
# - data/trigger-flag-*.json
# - *.lock files

# Note: Generated skills in ~/.claude/skills/ are NOT deleted
# You must manage those manually
```

### False positives (F3/F4/F28)

**Scenario**: The plugin generates a skill you don't want or the security scanner blocks a legitimate skill.

**Solutions:**

1. **Delete the unwanted skill**:
   ```bash
   rm -rf ~/.claude/skills/debug-fastapi-5xx  # example
   ```

2. **Adjust category whitelist** to reduce noise:
   ```bash
   export SELF_EVOLUTION_CATEGORY_WHITELIST="debug refactor"  # only generate debug/refactor skills
   ```

3. **Increase nudge interval** to reduce frequency:
   ```bash
   export SELF_EVOLUTION_NUDGE_INTERVAL=20  # trigger half as often
   ```

4. **Review security logs** to understand why content was blocked:
   ```bash
   cat ~/.claude/plugins/self-evolution/data/self-evolution.jsonl | \
     jq -r 'select(.level == "warn" and .event == "security_scan")'
   ```

**Common false-positive scenarios:**

- **Bash scripts that look dangerous**: Legitimate debugging commands like `docker logs` might contain `rm` or `curl`. Use the manual mode (`/evolve-review`) to review before creating the skill.
- **File paths outside whitelist**: If your workflow references `~/projects/` or other custom paths, edit the generated skill after creation to generalize the paths.
- **Base64-encoded content**: Legitimate base64 (e.g., encoded configuration) longer than 20 tokens will be blocked. Manually edit the skill if you really need it.

### Bad skills generated

**Scenario**: A skill was created but is buggy, incomplete, or misleading.

**Solutions:**

1. **Edit the skill manually**:
   ```bash
   # Find and edit the SKILL.md
   code ~/.claude/skills/debug-fastapi-5xx/SKILL.md
   ```

2. **Delete and regenerate**:
   ```bash
   rm -rf ~/.claude/skills/debug-fastapi-5xx
   # Trigger a new conversation with similar workflow
   # Auto mode will regenerate; or use /evolve-review
   ```

3. **Use skill-creator for iteration**:
   The generated skills are minimal (~50-200 lines). For complex workflows, use the full `skill-creator` skill to add scripts, references, and iterative improvements.

### Hook timeout

**Scenario**: Stop hook times out (90s limit) and the session exits without skill creation.

**Solutions:**

1. **Use manual mode instead**: Run `/evolve-review` during the conversation (before session ends) to avoid the timeout.
2. **Check logs for blocking operations**:
   ```bash
   cat ~/.claude/plugins/self-evolution/data/self-evolution.jsonl | \
     jq -r 'select(.event == "hook_timeout")'
   ```
3. **Reduce complexity**: If the skill-reviewer agent is taking too long, simplify the conversation context (fewer tool calls) or use `/evolve-review` with a smaller context window.

---

## Upgrade (F25)

### Before upgrading

1. **Backup existing skills**:
   ```bash
   cp -r ~/.claude/skills ~/.claude/skills.backup.$(date +%Y%m%d)
   ```

2. **Backup plugin data**:
   ```bash
   tar czf self-evolution-backup-$(date +%Y%m%d).tar.gz ~/.claude/plugins/self-evolution
   ```

3. **Disable the plugin**:
   ```bash
   /plugin disable self-evolution
   ```

### Apply upgrade

```bash
# Navigate to the plugin directory
cd /path/to/self-evolution-plugin

# Pull latest changes (if using git)
git pull origin main

# Or extract the new version tarball
tar xzf self-evolution-v0.5.0.tar.gz

# Re-enable the plugin
/plugin enable self-evolution
```

### Verify upgrade

```bash
# Check version
/plugin list | grep self-evolution

# Run a test conversation with >10 tool calls
# Check logs for successful skill creation
tail -f ~/.claude/plugins/self-evolution/data/self-evolution.jsonl
```

### Implementation notes

- **Backward compatibility**: v0.4.0→v0.5.0 is forward compatible; existing skills continue to work
- **Settings migration**: Plugin.json settings are preserved; new settings use defaults
- **Log format**: JSONL schema is stable; old logs remain readable by new code
- **Schema changes**: If frontmatter schema changes, old skills are grandfathered in (no auto-migration)

---

## Rollback (F29)

### Plugin rollback

To rollback to a previous version:

```bash
# Disable current version
/plugin disable self-evolution

# Restore from backup
cd ~/.claude/plugins
rm -rf self-evolution
tar xzf self-evolution-backup-20260508.tar.gz

# Re-enable
/plugin enable self-evolution
```

### State recovery

If upgrade corrupts state files:

```bash
# Reset plugin state (keeps generated skills)
cd ~/.claude/plugins/self-evolution
./scripts/reset-state.sh --apply

# Roll back logs
cp data/self-evolution.jsonl.2026-05-08T12:00:00Z data/self-evolution.jsonl
```

### Skill cleanup

To remove all skills generated by self-evolution (use with caution):

```bash
# List self-evolution generated skills (check meta-skill origin)
find ~/.claude/skills -name "SKILL.md" -exec grep -l "evolve-skill-writer" {} \;

# Remove them (manual verification recommended)
# Uncomment after reviewing the list above
# find ~/.claude/skills -name "SKILL.md" -exec grep -l "evolve-skill-writer" {} \; \
#   -exec dirname {} \; | xargs rm -rf
```

**Safety note**: Always review the list before deleting. Some manually created skills might reference evolve-skill-writer in their comments.

---

## Security model

Self-evolution is designed with a defense-in-depth security model:

### Open source verification

- All code is open source and auditable
- Plugin source: `~/.claude/plugins/self-evolution/`
- Meta-skill source: `skills/evolve-skill-writer/SKILL.md`
- Security scanner: `scripts/security-scan.sh` (bash, easily reviewed)

**Verification steps:**

1. **Review plugin.json**: Ensure hooks point to trusted scripts
2. **Audit security-scan.sh**: Check that detection patterns are comprehensive
3. **Read evolve-skill-writer**: Understand how skills are generated
4. **Monitor JSONL logs**: Review security events regularly

### Meta-skill as source of truth

The evolve-skill-writer meta-skill is the authoritative source for skill generation:

- **Declarative**: All rules are documented in SKILL.md (no hidden logic)
- **Self-validating**: Quality checklist is enforced before output
- **Redundant security**: Content safety checks duplicate L3 hard gate
- **No evals**: Non-interactive by design; no external code execution

### PreToolUse hook behavior

The global PreToolUse hook (`security-scan.sh`) runs before every Write/Edit/MultiEdit operation:

- **Timeout**: 10s (hard limit)
- **Scope**: All file writes in the session, not just skill creation
- **Failure mode**: If hook fails, the operation is blocked (fail-safe)
- **Audit**: All security events are logged with full context

**Important**: The PreToolUse hook applies to ALL tool calls, not just self-evolution. This is a security feature, not a limitation.

---

## Status: Current capabilities and roadmap

### Implemented (v0.4.0)

| Feature | Status | Notes |
|---------|--------|-------|
| Auto mode (Stop hook) | ✅ | Triggered every N tool calls |
| Manual mode (/evolve-review) | ✅ | On-demand skill creation |
| Three-layer hard gating | ✅ | Frequency, path whitelist, content scanner |
| Meta-skill generation | ✅ | evolve-skill-writer (v1: SKILL.md only) |
| JSONL logging | ✅ | All decisions and security events |
| Log rotation | ✅ | Max 10MB, 5 backups |
| Reset state script | ✅ | Clean runtime state without deleting skills |
| 8-category whitelist | ✅ | debug, refactor, test, deploy, data, web, cli, meta |
| Size limit enforcement | ✅ | 15KB max (configurable) |
| Security event logging | ✅ | warn level for all L5 blocks |

### v5 roadmap (planned)

| Feature | Status | Notes |
|---------|--------|-------|
| Automatic skill testing | 🔄 | Evals after skill creation |
| Skill deprecation | 🔄 | Mark old skills as stale |
| Skill merging | 🔄 | Combine similar skills automatically |
| Global skill index | 🔄 | Full-text search across all skills |
| Skill quality scoring | 🔄 | Rate skills by usage and effectiveness |
| Interactive refinement | 🔄 | User feedback loop for improving generated skills |
| Multi-language support | 🔄 | Generate skills in different languages |
| Skill templates | 🔄 | User-defined templates for customization |

---

## Acknowledged residual risks (R2 review)

The following risks have been identified in the R2 security review. Mitigations are in place, but users should be aware:

### F36: Model hallucination in skill generation

**Risk**: The LLM might generate incorrect or misleading skill content.

**Mitigation**:
- Quality checklist in evolve-skill-writer enforces basic correctness
- Users can manually edit/delete generated skills
- Security scanner blocks dangerous patterns
- False positives are acceptable (better to block than to allow bad content)

**User action**: Review generated skills before critical workflows. Use `/evolve-review` for manual mode to preview skills.

### F38: Credential leakage via generated skills

**Risk**: The LLM might include secrets (API keys, tokens, passwords) in generated skill content.

**Mitigation**:
- L3 content scanner blocks secret-like patterns (but not 100% coverage)
- evolve-skill-writer includes explicit instructions against including private data
- Security event logging allows audit of blocked content
- Users are encouraged to review generated skills

**User action**: Check generated skills for secrets before committing to version control. Delete and regenerate if secrets are found.

### F39: Path traversal via skill names

**Risk**: Skill names with `../` could write files outside the intended directory.

**Mitigation**:
- L4 path whitelist validates all paths before Write/Edit operations
- security-scan.sh explicitly blocks path traversal patterns
- Meta-skill enforces naming convention (`<category>-<kebab-name>`)
- All paths are resolved to absolute paths before validation

**User action**: If you see suspicious paths in logs, run `./scripts/reset-state.sh --apply` to clean up.

### F45: Log file exhaustion

**Risk**: Unbounded log growth could fill disk space.

**Mitigation**:
- Log rotation (F45) limits file size to 10MB and keeps 5 backups
- JSONL logs are compressed for archival
- Reset-state script can delete logs if needed
- Users can manually rotate or archive logs

**User action**: Monitor disk usage in `~/.claude/plugins/self-evolution/data/`. If logs grow too large, manually delete or archive old backups.

---

## Support and feedback

- **Issues**: Report bugs or feature requests via the project's issue tracker
- **Discussion**: Join the community for best practices and troubleshooting
- **Contribution**: Pull requests welcome for improvements to the meta-skill, security scanner, or documentation

**Version history:**
- v0.4.0 (2026-05-09): Production release with three-layer hard gating, meta-skill generation, and comprehensive logging
- v0.3.0 (2026-05-01): Beta release with manual mode only
- v0.1.0 (2026-04-15): Initial prototype

---

**Happy skill hunting!** 🚀