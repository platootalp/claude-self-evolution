# Agentic Config Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/evolve-config` slash command + config agent + runtime commands to enable conversational configuration management.

**Architecture:** Two new runtime commands (`config-get`, `config-set`) provide validated config read/write with env var awareness. A config agent interprets natural language and calls these commands. A slash command triggers the agent in-session.

**Tech Stack:** TypeScript, esbuild, vitest, Claude Code plugin manifest v2

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/config.ts` | Modify | Add `CONFIG_SCHEMA`, `getEnvVarName()`, `loadRawConfig()`, `validateConfigValue()` |
| `src/commands/config-get.ts` | Create | Runtime command: read config with source tracking |
| `src/commands/config-set.ts` | Create | Runtime command: validate + write config with reset support |
| `src/runtime.ts` | Modify | Add `config-get` and `config-set` cases to command router |
| `agents/config-agent.md` | Create | Conversational config agent prompt |
| `commands/evolve-config.md` | Create | Slash command definition for `/evolve-config` |
| `src/__tests__/config-get.test.ts` | Create | Tests for config-get command |
| `src/__tests__/config-set.test.ts` | Create | Tests for config-set command |

---

### Task 1: Extend `src/lib/config.ts` with schema, env var mapping, raw loader, and validation

**Files:**
- Modify: `src/lib/config.ts`
- Test: `src/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing tests for new config functions**

Add these tests to `src/__tests__/config.test.ts`:

```typescript
import { CONFIG_SCHEMA, getEnvVarName, loadRawConfig, validateConfigValue } from "../lib/config.js";

describe("CONFIG_SCHEMA", () => {
  it("has an entry for every Config key", () => {
    const configKeys = Object.keys(loadConfig(tmpDir));
    const schemaKeys = Object.keys(CONFIG_SCHEMA);
    for (const key of configKeys) {
      expect(schemaKeys).toContain(key);
    }
  });
});

describe("getEnvVarName", () => {
  it("returns SELF_EVOLUTION_LOG_LEVEL for log_level", () => {
    expect(getEnvVarName("log_level")).toBe("SELF_EVOLUTION_LOG_LEVEL");
  });
  it("returns SELF_EVOLUTION_NUDGE_INTERVAL for nudge_interval", () => {
    expect(getEnvVarName("nudge_interval")).toBe("SELF_EVOLUTION_NUDGE_INTERVAL");
  });
  it("returns undefined for unknown key", () => {
    expect(getEnvVarName("nonexistent")).toBeUndefined();
  });
});

describe("loadRawConfig", () => {
  it("returns empty object when no config.json exists", () => {
    const raw = loadRawConfig(tmpDir);
    expect(raw).toEqual({});
  });
  it("returns only user-set keys from config.json", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({ log_level: "debug" }));
    const raw = loadRawConfig(tmpDir);
    expect(raw).toEqual({ log_level: "debug" });
  });
});

describe("validateConfigValue", () => {
  it("accepts valid enum value for log_level", () => {
    const result = validateConfigValue("log_level", "debug");
    expect(result.ok).toBe(true);
    expect(result.value).toBe("debug");
  });
  it("rejects invalid enum value for log_level", () => {
    const result = validateConfigValue("log_level", "verbose");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("off");
  });
  it("accepts valid int for nudge_interval", () => {
    const result = validateConfigValue("nudge_interval", "5");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(5);
  });
  it("rejects nudge_interval below minimum", () => {
    const result = validateConfigValue("nudge_interval", "0");
    expect(result.ok).toBe(false);
    expect(result.error).toContain(">=");
  });
  it("accepts valid array for category_whitelist", () => {
    const result = validateConfigValue("category_whitelist", '["debug","test"]');
    expect(result.ok).toBe(true);
    expect(result.value).toEqual(["debug", "test"]);
  });
  it("rejects empty array for category_whitelist", () => {
    const result = validateConfigValue("category_whitelist", "[]");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("non-empty");
  });
  it("rejects unknown key", () => {
    const result = validateConfigValue("nonexistent", "foo");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("unknown key");
  });
  it("accepts valid review_max_turns in range 1-20", () => {
    expect(validateConfigValue("review_max_turns", "1").ok).toBe(true);
    expect(validateConfigValue("review_max_turns", "20").ok).toBe(true);
  });
  it("rejects review_max_turns out of range", () => {
    expect(validateConfigValue("review_max_turns", "0").ok).toBe(false);
    expect(validateConfigValue("review_max_turns", "21").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: FAIL — `CONFIG_SCHEMA`, `getEnvVarName`, `loadRawConfig`, `validateConfigValue` are not exported

- [ ] **Step 3: Implement the new config functions**

Add to `src/lib/config.ts`:

```typescript
export interface ConfigFieldSchema {
  type: "enum" | "int" | "string" | "string[]";
  enumValues?: string[];
  min?: number;
  max?: number;
  description: string;
}

export const CONFIG_SCHEMA: Record<string, ConfigFieldSchema> = {
  log_level: { type: "enum", enumValues: ["off", "info", "debug"], description: "Logging verbosity" },
  nudge_interval: { type: "int", min: 1, description: "Tool calls before review trigger" },
  review_model: { type: "enum", enumValues: ["sonnet", "opus", "haiku"], description: "Model for companion reviewer" },
  platform: { type: "enum", enumValues: ["auto", "claude-code", "codex", "cursor"], description: "Target platform" },
  category_whitelist: { type: "string[]", description: "Skill categories to extract" },
  meta_skill_name: { type: "string", description: "Name of the skill-writing meta-skill" },
  review_max_turns: { type: "int", min: 1, max: 20, description: "Max turns for companion review" },
  max_skill_file_size: { type: "int", min: 1024, description: "Max bytes per skill file" },
  max_skill_total_size: { type: "int", min: 1024, description: "Max total bytes per skill" },
  max_files_per_skill: { type: "int", min: 1, max: 100, description: "Max files per skill" },
  binary_extensions: { type: "string[]", description: "File extensions to block" },
};

const ENV_VAR_MAP: Record<string, string> = {
  nudge_interval: "SELF_EVOLUTION_NUDGE_INTERVAL",
  review_model: "SELF_EVOLUTION_REVIEW_MODEL",
  platform: "SELF_EVOLUTION_PLATFORM",
  log_level: "SELF_EVOLUTION_LOG_LEVEL",
  review_max_turns: "SELF_EVOLUTION_REVIEW_MAX_TURNS",
  max_skill_file_size: "SELF_EVOLUTION_MAX_SKILL_FILE_SIZE",
  max_skill_total_size: "SELF_EVOLUTION_MAX_SKILL_TOTAL_SIZE",
  max_files_per_skill: "SELF_EVOLUTION_MAX_FILES_PER_SKILL",
};

export function getEnvVarName(key: string): string | undefined {
  return ENV_VAR_MAP[key];
}

export function loadRawConfig(pluginRoot: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(path.join(pluginRoot, "config.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export interface ValidateResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export function validateConfigValue(key: string, rawValue: string): ValidateResult {
  const schema = CONFIG_SCHEMA[key];
  if (!schema) {
    return { ok: false, error: `unknown key '${key}'. Valid keys: ${Object.keys(CONFIG_SCHEMA).join(", ")}` };
  }

  if (schema.type === "enum") {
    if (!schema.enumValues!.includes(rawValue)) {
      return { ok: false, error: `invalid value '${rawValue}' for ${key}. Valid values: ${schema.enumValues!.join(", ")}` };
    }
    return { ok: true, value: rawValue };
  }

  if (schema.type === "int") {
    const num = parseInt(rawValue, 10);
    if (isNaN(num)) {
      return { ok: false, error: `${key} must be an integer, got '${rawValue}'` };
    }
    if (schema.min !== undefined && num < schema.min) {
      return { ok: false, error: `${key} must be >= ${schema.min}, got ${num}` };
    }
    if (schema.max !== undefined && num > schema.max) {
      return { ok: false, error: `${key} must be <= ${schema.max}, got ${num}` };
    }
    return { ok: true, value: num };
  }

  if (schema.type === "string") {
    if (!rawValue || rawValue.trim().length === 0) {
      return { ok: false, error: `${key} must be a non-empty string` };
    }
    return { ok: true, value: rawValue };
  }

  if (schema.type === "string[]") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      return { ok: false, error: `${key} must be a JSON array, got '${rawValue}'` };
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { ok: false, error: `${key} must be a non-empty array` };
    }
    return { ok: true, value: parsed };
  }

  return { ok: false, error: `unsupported type '${schema.type}' for ${key}` };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/config.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts src/__tests__/config.test.ts
git commit -m "feat(config): add CONFIG_SCHEMA, getEnvVarName, loadRawConfig, validateConfigValue"
```

---

### Task 2: Implement `config-get` command

**Files:**
- Create: `src/commands/config-get.ts`
- Create: `src/__tests__/config-get.test.ts`

- [ ] **Step 1: Write the failing tests for config-get**

Create `src/__tests__/config-get.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { handleConfigGet, parseConfigGetArgs } from "../commands/config-get.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-config-get-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.SELF_EVOLUTION_LOG_LEVEL;
});

describe("parseConfigGetArgs", () => {
  it("parses --key flag", () => {
    const args = parseConfigGetArgs(["--key", "log_level"]);
    expect(args.key).toBe("log_level");
  });

  it("returns empty key when no flag", () => {
    const args = parseConfigGetArgs([]);
    expect(args.key).toBe("");
  });
});

describe("handleConfigGet", () => {
  it("returns all config with default sources when no config.json", () => {
    const result = handleConfigGet(tmpDir);
    const logLevel = result.find((r) => r.key === "log_level")!;
    expect(logLevel.value).toBe("info");
    expect(logLevel.source).toBe("default");
  });

  it("returns config_file source for keys in config.json", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({ log_level: "debug" }));
    const result = handleConfigGet(tmpDir);
    const logLevel = result.find((r) => r.key === "log_level")!;
    expect(logLevel.value).toBe("debug");
    expect(logLevel.source).toBe("config_file");
  });

  it("returns env_var source when env var is set", () => {
    process.env.SELF_EVOLUTION_LOG_LEVEL = "off";
    const result = handleConfigGet(tmpDir);
    const logLevel = result.find((r) => r.key === "log_level")!;
    expect(logLevel.value).toBe("off");
    expect(logLevel.source).toBe("env_var");
  });

  it("env_var source takes precedence over config_file", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({ log_level: "debug" }));
    process.env.SELF_EVOLUTION_LOG_LEVEL = "off";
    const result = handleConfigGet(tmpDir);
    const logLevel = result.find((r) => r.key === "log_level")!;
    expect(logLevel.value).toBe("off");
    expect(logLevel.source).toBe("env_var");
  });

  it("returns 11 entries (one per config key)", () => {
    const result = handleConfigGet(tmpDir);
    expect(result).toHaveLength(11);
  });

  it("with key filter returns single entry", () => {
    const result = handleConfigGet(tmpDir, "log_level");
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("log_level");
  });

  it("with invalid key returns empty array", () => {
    const result = handleConfigGet(tmpDir, "nonexistent");
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/config-get.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement config-get command**

Create `src/commands/config-get.ts`:

```typescript
import { loadConfig, resolveConfig, loadRawConfig, getEnvVarName, CONFIG_SCHEMA } from "../lib/config.js";
import type { Config } from "../lib/config.js";

export interface ConfigGetArgs {
  key: string;
}

export interface ConfigGetEntry {
  key: string;
  value: unknown;
  source: "default" | "config_file" | "env_var";
}

export function parseConfigGetArgs(argv: string[]): ConfigGetArgs {
  const args: ConfigGetArgs = { key: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--key" && argv[i + 1]) {
      args.key = argv[++i];
    }
  }
  return args;
}

export function handleConfigGet(pluginRoot: string, filterKey?: string): ConfigGetEntry[] {
  const resolved = resolveConfig(pluginRoot);
  const raw = loadRawConfig(pluginRoot);
  const fileConfig = loadConfig(pluginRoot);
  const defaults: Config = { nudge_interval: 10, review_model: "sonnet", platform: "auto", category_whitelist: ["debug", "refactor", "test", "deploy", "data", "web", "cli", "meta"], meta_skill_name: "evolve-skill-writer", log_level: "info", review_max_turns: 8, max_skill_file_size: 262144, max_skill_total_size: 1048576, max_files_per_skill: 50, binary_extensions: [".exe", ".dll", ".so", ".dylib", ".bin", ".bat", ".cmd", ".ps1", ".com"] };

  const keys = filterKey ? [filterKey] : Object.keys(CONFIG_SCHEMA);
  const validKeys = filterKey ? (CONFIG_SCHEMA[filterKey] ? [filterKey] : []) : keys;

  return validKeys.map((key) => {
    const envVar = getEnvVarName(key);
    let source: ConfigGetEntry["source"] = "default";
    if (envVar && process.env[envVar]) {
      source = "env_var";
    } else if (key in raw) {
      source = "config_file";
    }
    return { key, value: (resolved as any)[key], source };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/config-get.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/config-get.ts src/__tests__/config-get.test.ts
git commit -m "feat(config-get): implement config-get runtime command with source tracking"
```

---

### Task 3: Implement `config-set` command

**Files:**
- Create: `src/commands/config-set.ts`
- Create: `src/__tests__/config-set.test.ts`

- [ ] **Step 1: Write the failing tests for config-set**

Create `src/__tests__/config-set.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { handleConfigSet, parseConfigSetArgs } from "../commands/config-set.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-config-set-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.SELF_EVOLUTION_LOG_LEVEL;
});

describe("parseConfigSetArgs", () => {
  it("parses --key and --value flags", () => {
    const args = parseConfigSetArgs(["--key", "log_level", "--value", "debug"]);
    expect(args.key).toBe("log_level");
    expect(args.value).toBe("debug");
    expect(args.reset).toBe(false);
  });

  it("parses --reset flag", () => {
    const args = parseConfigSetArgs(["--key", "log_level", "--reset"]);
    expect(args.key).toBe("log_level");
    expect(args.reset).toBe(true);
    expect(args.value).toBe("");
  });

  it("returns empty defaults when no flags", () => {
    const args = parseConfigSetArgs([]);
    expect(args.key).toBe("");
    expect(args.value).toBe("");
    expect(args.reset).toBe(false);
  });
});

describe("handleConfigSet", () => {
  it("sets a valid value and creates config.json", () => {
    const result = handleConfigSet(tmpDir, "log_level", "debug");
    expect(result.ok).toBe(true);
    expect(result.key).toBe("log_level");
    expect(result.new_value).toBe("debug");
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, "config.json"), "utf-8"));
    expect(written.log_level).toBe("debug");
  });

  it("updates existing config.json preserving other keys", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({ nudge_interval: 5 }));
    const result = handleConfigSet(tmpDir, "log_level", "off");
    expect(result.ok).toBe(true);
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, "config.json"), "utf-8"));
    expect(written.log_level).toBe("off");
    expect(written.nudge_interval).toBe(5);
  });

  it("rejects invalid key", () => {
    const result = handleConfigSet(tmpDir, "nonexistent", "foo");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("unknown key");
  });

  it("rejects invalid value for enum", () => {
    const result = handleConfigSet(tmpDir, "log_level", "verbose");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Valid values");
  });

  it("rejects out-of-range int value", () => {
    const result = handleConfigSet(tmpDir, "nudge_interval", "0");
    expect(result.ok).toBe(false);
    expect(result.error).toContain(">=");
  });

  it("sets int value correctly", () => {
    const result = handleConfigSet(tmpDir, "nudge_interval", "5");
    expect(result.ok).toBe(true);
    expect(result.new_value).toBe(5);
  });

  it("sets array value correctly", () => {
    const result = handleConfigSet(tmpDir, "category_whitelist", '["debug","test"]');
    expect(result.ok).toBe(true);
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, "config.json"), "utf-8"));
    expect(written.category_whitelist).toEqual(["debug", "test"]);
  });

  it("resets a key by removing it from config.json", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({ log_level: "debug", nudge_interval: 5 }));
    const result = handleConfigSet(tmpDir, "log_level", "", true);
    expect(result.ok).toBe(true);
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, "config.json"), "utf-8"));
    expect(written.log_level).toBeUndefined();
    expect(written.nudge_interval).toBe(5);
  });

  it("reports old_value when changing existing key", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({ log_level: "debug" }));
    const result = handleConfigSet(tmpDir, "log_level", "off");
    expect(result.ok).toBe(true);
    expect(result.old_value).toBe("debug");
  });

  it("reports default as old_value when key not in config.json", () => {
    const result = handleConfigSet(tmpDir, "log_level", "debug");
    expect(result.ok).toBe(true);
    expect(result.old_value).toBe("info");
  });

  it("reports env_var source when env var is active", () => {
    process.env.SELF_EVOLUTION_LOG_LEVEL = "off";
    const result = handleConfigSet(tmpDir, "log_level", "debug");
    expect(result.ok).toBe(true);
    expect(result.source).toBe("env_var");
  });

  it("writes pretty-printed JSON", () => {
    handleConfigSet(tmpDir, "log_level", "debug");
    const content = fs.readFileSync(path.join(tmpDir, "config.json"), "utf-8");
    expect(content).toContain("\n");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/config-set.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement config-set command**

Create `src/commands/config-set.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import { loadConfig, resolveConfig, loadRawConfig, getEnvVarName, validateConfigValue, CONFIG_SCHEMA } from "../lib/config.js";
import type { Config } from "../lib/config.js";

export interface ConfigSetArgs {
  key: string;
  value: string;
  reset: boolean;
}

export interface ConfigSetResult {
  ok: boolean;
  key: string;
  old_value?: unknown;
  new_value?: unknown;
  source?: string;
  error?: string;
}

export function parseConfigSetArgs(argv: string[]): ConfigSetArgs {
  const args: ConfigSetArgs = { key: "", value: "", reset: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--key" && argv[i + 1]) {
      args.key = argv[++i];
    } else if (argv[i] === "--value" && argv[i + 1]) {
      args.value = argv[++i];
    } else if (argv[i] === "--reset") {
      args.reset = true;
    }
  }
  return args;
}

export function handleConfigSet(pluginRoot: string, key: string, rawValue: string, reset: boolean = false): ConfigSetResult {
  if (!CONFIG_SCHEMA[key]) {
    return { ok: false, key, error: `unknown key '${key}'. Valid keys: ${Object.keys(CONFIG_SCHEMA).join(", ")}` };
  }

  const resolved = resolveConfig(pluginRoot);
  const old_value = (resolved as any)[key];
  const envVar = getEnvVarName(key);
  const source = envVar && process.env[envVar] ? "env_var" : "config_file";

  if (reset) {
    const raw = loadRawConfig(pluginRoot);
    delete raw[key];
    const configPath = path.join(pluginRoot, "config.json");
    try {
      fs.writeFileSync(configPath, JSON.stringify(raw, null, 2) + "\n");
    } catch (err) {
      return { ok: false, key, error: `failed to write config.json: ${err}` };
    }
    return { ok: true, key, old_value, new_value: undefined, source };
  }

  const validation = validateConfigValue(key, rawValue);
  if (!validation.ok) {
    return { ok: false, key, error: validation.error };
  }

  const raw = loadRawConfig(pluginRoot);
  raw[key] = validation.value;
  const configPath = path.join(pluginRoot, "config.json");
  try {
    fs.writeFileSync(configPath, JSON.stringify(raw, null, 2) + "\n");
  } catch (err) {
    return { ok: false, key, error: `failed to write config.json: ${err}` };
  }

  return { ok: true, key, old_value, new_value: validation.value, source };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/config-set.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/config-set.ts src/__tests__/config-set.test.ts
git commit -m "feat(config-set): implement config-set runtime command with validation and reset"
```

---

### Task 4: Wire `config-get` and `config-set` into `src/runtime.ts`

**Files:**
- Modify: `src/runtime.ts`
- Test: `src/__tests__/runtime.test.ts`

- [ ] **Step 1: Write the failing tests for runtime routing**

Add to `src/__tests__/runtime.test.ts`:

```typescript
describe("runCommand config-get", () => {
  it("returns JSON with config entries", () => {
    const exitCode = runCommand("config-get", [], "");
    expect(exitCode).toBe(0);
  });
});

describe("runCommand config-set", () => {
  it("sets a config value and returns JSON", () => {
    const exitCode = runCommand("config-set", ["--key", "log_level", "--value", "debug"], "");
    expect(exitCode).toBe(0);
  });

  it("returns exit code 1 for invalid key", () => {
    const exitCode = runCommand("config-set", ["--key", "nonexistent", "--value", "foo"], "");
    expect(exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/runtime.test.ts`
Expected: FAIL — `config-get`/`config-set` hit the `default` case

- [ ] **Step 3: Add config-get and config-set to runtime router**

Add imports at top of `src/runtime.ts`:

```typescript
import { handleConfigGet, parseConfigGetArgs } from "./commands/config-get.js";
import { handleConfigSet, parseConfigSetArgs } from "./commands/config-set.js";
```

Add two new cases to the `switch` in `runCommand`, before the `default:` case:

```typescript
case "config-get": {
  const getArgs = parseConfigGetArgs(args);
  const result = handleConfigGet(pluginRoot, getArgs.key || undefined);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return 0;
}

case "config-set": {
  const setArgs = parseConfigSetArgs(args);
  if (!setArgs.key) {
    process.stdout.write(JSON.stringify({ ok: false, key: "", error: "missing --key" }) + "\n");
    return 1;
  }
  if (!setArgs.reset && !setArgs.value) {
    process.stdout.write(JSON.stringify({ ok: false, key: setArgs.key, error: "missing --value (or use --reset)" }) + "\n");
    return 1;
  }
  const result = handleConfigSet(pluginRoot, setArgs.key, setArgs.value, setArgs.reset);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return result.ok ? 0 : 1;
}
```

- [ ] **Step 4: Run all tests to verify they pass**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/runtime.ts src/__tests__/runtime.test.ts
git commit -m "feat(runtime): wire config-get and config-set commands into router"
```

---

### Task 5: Create the config agent and slash command

**Files:**
- Create: `agents/config-agent.md`
- Create: `commands/evolve-config.md`

- [ ] **Step 1: Create the config agent prompt**

Create `agents/config-agent.md`:

```markdown
---
name: config-agent
description: Manages self-evolution plugin configuration through natural conversation. Reads and writes settings via config-get/config-set runtime commands.
model: inherit
effort: low
maxTurns: 8
tools: [Bash, Read]
disallowedTools: [Task, WebFetch, WebSearch, Write, Edit]
---

You are a Config Agent for the self-evolution plugin. You help users view and change plugin settings through conversation.

## Available Commands

Read config:
  node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" config-get [--key <key>]

Write config:
  node "${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" config-set --key <key> --value <value> [--reset]

## Settings Schema

| Key | Type | Valid Values | Default | Description |
|-----|------|-------------|---------|-------------|
| log_level | enum | off, info, debug | info | Logging verbosity |
| nudge_interval | int | >= 1 | 10 | Tool calls before review trigger |
| review_model | enum | sonnet, opus, haiku | sonnet | Model for companion reviewer |
| platform | enum | auto, claude-code, codex, cursor | auto | Target platform |
| category_whitelist | string[] | non-empty JSON array | ["debug","refactor","test","deploy","data","web","cli","meta"] | Skill categories to extract |
| meta_skill_name | string | non-empty | evolve-skill-writer | Name of the skill-writing meta-skill |
| review_max_turns | int | 1-20 | 8 | Max turns for companion review |
| max_skill_file_size | int | >= 1024 | 262144 | Max bytes per skill file |
| max_skill_total_size | int | >= 1024 | 1048576 | Max total bytes per skill |
| max_files_per_skill | int | 1-100 | 50 | Max files per skill |
| binary_extensions | string[] | non-empty JSON array | [".exe",...] | File extensions to block |

## Behavior

1. **First turn**: Run `config-get` (no --key) to load all current settings. Greet the user with a concise summary table of current config.

2. **Interpret requests**: Map natural language to commands:
   - "把日志级别改成debug" / "change log level to debug" → `config-set --key log_level --value debug`
   - "现在用的什么模型" / "what model is being used" → `config-get --key review_model`
   - "把nudge间隔调到5" / "set nudge interval to 5" → `config-set --key nudge_interval --value 5`
   - "恢复默认" / "reset to default" → `config-set --key <key> --reset` for each non-default key

3. **After a successful set**: Show the change as "old_value → new_value". If the source is "env_var", warn the user that the config file change won't take effect because an environment variable is overriding it, and tell them which env var.

4. **On validation error**: Explain the issue and suggest valid values. Do not retry automatically.

5. **Off-topic guard**: Only handle configuration. For other questions, redirect: "I only handle plugin configuration. Use /evolve-status for status, /evolve-review for skill review."

6. **Language**: Respond in the same language the user uses (Chinese or English).
```

- [ ] **Step 2: Create the slash command**

Create `commands/evolve-config.md`:

```markdown
---
description: Manage self-evolution plugin configuration through conversation.
allowed-tools: Bash(node:*)
argument-hint: "[setting or question]"
---

Use the Task tool to launch the `config-agent` subagent.

Pass these inputs:
- User's question or request: $ARGUMENTS

After the subagent completes, summarize in ONE sentence.
```

- [ ] **Step 3: Verify files are correctly placed**

Run: `ls -la agents/config-agent.md commands/evolve-config.md`
Expected: Both files exist

- [ ] **Step 4: Commit**

```bash
git add agents/config-agent.md commands/evolve-config.md
git commit -m "feat(config): add config agent and /evolve-config slash command"
```

---

### Task 6: Build, full test suite, and version bump

**Files:**
- Modify: `.claude-plugin/plugin.json` (version bump)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: Build succeeds, `dist/runtime.mjs` is updated

- [ ] **Step 3: Verify config-get works via CLI**

Run: `node dist/runtime.mjs config-get`
Expected: JSON output with all 11 config entries, each with key, value, source

- [ ] **Step 4: Verify config-set works via CLI**

Run: `node dist/runtime.mjs config-set --key log_level --value debug`
Expected: JSON output with `{ok: true, key: "log_level", old_value: "info", new_value: "debug"}`

- [ ] **Step 5: Verify config-set reset works**

Run: `node dist/runtime.mjs config-set --key log_level --reset`
Expected: JSON output with `{ok: true, key: "log_level"}`

- [ ] **Step 6: Verify invalid key is rejected**

Run: `node dist/runtime.mjs config-set --key nonexistent --value foo`
Expected: JSON output with `{ok: false, error: "unknown key..."}`

- [ ] **Step 7: Bump version in `.claude-plugin/plugin.json`**

Change version from `"0.9.0"` to `"0.10.0"`.

- [ ] **Step 8: Final commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "chore: bump version to 0.10.0"
```

---

## Self-Review

**1. Spec coverage:**
- Config schema with all 11 settings → Task 1 (CONFIG_SCHEMA)
- `config-get` command with source tracking → Task 2
- `config-set` command with validation + reset → Task 3
- Runtime router wiring → Task 4
- Config agent with natural language, greeting, env var awareness → Task 5
- `/evolve-config` slash command → Task 5
- Error handling (invalid key, invalid value, range, write failure) → Task 1 (validateConfigValue) + Task 3 (handleConfigSet)
- Version bump → Task 6
- All covered.

**2. Placeholder scan:** No TBD, TODO, or "implement later" found. All code blocks are complete.

**3. Type consistency:**
- `ConfigGetEntry` used in Task 2 handler and returned from `handleConfigGet` — consistent
- `ConfigSetResult` used in Task 3 handler and returned from `handleConfigSet` — consistent
- `ValidateResult` defined in Task 1 and used by `validateConfigValue` — consistent
- `CONFIG_SCHEMA` keys match `Config` interface keys — verified by test
- Runtime router in Task 4 uses `parseConfigGetArgs`/`parseConfigSetArgs` from the same modules — consistent
