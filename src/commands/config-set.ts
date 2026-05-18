import fs from "node:fs";
import path from "node:path";
import { resolveConfig, loadRawConfig, getEnvVarName, validateConfigValue, CONFIG_SCHEMA } from "../lib/config.js";

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
