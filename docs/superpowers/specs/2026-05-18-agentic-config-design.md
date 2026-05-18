# Agentic Config Management

Date: 2026-05-18

## Problem

The self-evolution plugin has 11 configurable settings but no user-facing mechanism to change them interactively. Users must manually edit `config.json` or set environment variables — frustrating for common operations like changing log level or review model.

## Solution

Add a `/evolve-config` slash command that spawns a **config agent**. The agent handles configuration through natural conversation, backed by two new runtime commands (`config-get`, `config-set`) that provide validation and env var awareness.

## Architecture

```
User: /evolve-config → Claude spawns config-agent → agent calls runtime.mjs config-get/config-set → agent explains result
```

Three new components:
1. **`commands/evolve-config.md`** — Slash command definition
2. **`agents/config-agent.md`** — Conversational config agent
3. **`src/commands/config-get.ts`** + **`src/commands/config-set.ts`** — Runtime command handlers

The agent runs in-session (not companion-mode), since config changes are immediate and the user wants instant feedback.

## Config Settings Schema

| Key | Type | Default | Validation | Description |
|-----|------|---------|------------|-------------|
| `log_level` | enum | `"info"` | `"off"` \| `"info"` \| `"debug"` | Logging verbosity |
| `nudge_interval` | int | `10` | ≥ 1 | Tool calls before review trigger |
| `review_model` | enum | `"sonnet"` | `"sonnet"` \| `"opus"` \| `"haiku"` | Model for companion reviewer |
| `platform` | enum | `"auto"` | `"auto"` \| `"claude-code"` \| `"codex"` \| `"cursor"` | Target platform |
| `category_whitelist` | string[] | `["debug","refactor","test","deploy","data","web","cli","meta"]` | non-empty array | Skill categories to extract |
| `meta_skill_name` | string | `"evolve-skill-writer"` | non-empty | Name of the skill-writing meta-skill |
| `review_max_turns` | int | `8` | 1–20 | Max turns for companion review |
| `max_skill_file_size` | int | `262144` | ≥ 1024 | Max bytes per skill file |
| `max_skill_total_size` | int | `1048576` | ≥ 1024 | Max total bytes per skill |
| `max_files_per_skill` | int | `50` | 1–100 | Max files per skill |
| `binary_extensions` | string[] | `[".exe",".dll",".so",".dylib",".bin",".bat",".cmd",".ps1",".com"]` | non-empty | File extensions to block |

## Runtime Command: `config-get`

```
node runtime.mjs config-get [--key <key>]
```

- No `--key`: returns all resolved config as JSON. Each field: `{value, source}` where source is `"config_file"`, `"env_var"`, or `"default"`
- With `--key`: returns single key's resolved value + source
- Exit code 0 on success, 1 on invalid key

### Implementation

- Reuse `loadConfig()` to get file-level config (to determine which keys the user explicitly set vs defaulted)
- Reuse `resolveConfig()` to get the final resolved config
- For each key, determine source by checking: env var set → `"env_var"`, key present in config.json → `"config_file"`, else → `"default"`
- Output JSON to stdout

## Runtime Command: `config-set`

```
node runtime.mjs config-set --key <key> --value <value> [--reset]
```

- `--key` required, `--value` required (unless `--reset`)
- `--reset`: removes the key from `config.json`, reverting to default
- Validates type and value range before writing (per schema above)
- Writes to `config.json` in plugin root (creates file if it doesn't exist)
- Only writes explicitly set keys — unset keys fall through to defaults
- Returns JSON: `{ok: true, key, old_value, new_value, source}` or `{ok: false, key, error}`
- Exit code 0 on success, 1 on validation error, 2 on write error

### Implementation

- Parse `--key`, `--value`, `--reset` from args
- Validate key exists in schema
- Validate value against type and range rules
- Read existing `config.json` (or `{}`)
- Set or delete the key
- Write pretty-printed JSON back to `config.json`
- Output result JSON to stdout

## Config Agent Behavior

The agent prompt (`agents/config-agent.md`) instructs:

1. **On first turn**: Call `config-get` (no args) to load all current settings, then greet the user with a summary of current config
2. **Interpret natural language**: Map requests to runtime commands:
   - "把日志级别改成debug" → `config-set --key log_level --value debug`
   - "现在用的什么模型" → `config-get --key review_model`
   - "把nudge间隔调到5" → `config-set --key nudge_interval --value 5`
   - "恢复默认设置" → agent calls `config-set --reset` for each non-default key (iteratively)
3. **Validate before writing**: `config-set` returns `{ok: true/false}`. On error, explain the issue and suggest valid values
4. **Show the change**: After a successful set, show old value → new value, mention if an env var override is active
5. **Support reset**: `config-set --key <key> --reset` removes a key from `config.json`, reverting to default
6. **Off-topic guard**: Only handle configuration. Redirect other questions to appropriate commands

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/commands/config-get.ts` | Create | Runtime command handler for reading config |
| `src/commands/config-set.ts` | Create | Runtime command handler for writing config |
| `src/lib/config.ts` | Modify | Add `CONFIG_SCHEMA` (key→{type,validation} map), `getEnvVarName(key)` (returns env var name for a key), `loadRawConfig(pluginRoot)` (reads config.json without merging defaults), `validateConfigValue(key, value)` (returns `{ok, error?}`) |
| `src/runtime.ts` | Modify | Add `config-get` and `config-set` cases to the command router |
| `agents/config-agent.md` | Create | Config agent prompt with schema, behavior rules, example interactions |
| `commands/evolve-config.md` | Create | Slash command definition for `/evolve-config` |
| `config.default.json` | No change | Defaults remain authoritative |

## Error Handling

- Invalid key: `{ok: false, error: "unknown key 'foo'. Valid keys: log_level, nudge_interval, ..."}` 
- Invalid value: `{ok: false, error: "invalid value 'bar' for log_level. Valid values: off, info, debug"}`
- Range violation: `{ok: false, error: "nudge_interval must be >= 1, got 0"}`
- Write failure: `{ok: false, error: "failed to write config.json: <message>"}`
- Env var override: `config-get` reports source as `"env_var"` so agent can inform user the config file value won't take effect
