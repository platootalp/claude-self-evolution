import fs from "node:fs";
import path from "node:path";
import { resolveConfig, loadConfig, loadRawConfig, getEnvVarName, validateConfigValue, CONFIG_SCHEMA } from "../lib/config.js";
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
  env_var?: string;
  error?: string;
  errorCode?: number;
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

function getConfigValue(resolved: Config, key: string): unknown {
  return (resolved as any)[key];
}

export function handleConfigSet(pluginRoot: string, pluginData: string, key: string, rawValue: string, reset: boolean = false): ConfigSetResult {
  if (!CONFIG_SCHEMA[key]) {
    return { ok: false, key, error: `unknown key '${key}'. Valid keys: ${Object.keys(CONFIG_SCHEMA).join(", ")}`, errorCode: 1 };
  }

  const resolved = resolveConfig(pluginRoot, pluginData);
  const old_value = getConfigValue(resolved, key);
  const envVar = getEnvVarName(key);
  const hasEnvOverride = envVar && process.env[envVar];

  if (reset) {
    const raw = loadRawConfig(pluginRoot, pluginData);
    delete raw[key];
    const configPath = path.join(pluginData, "config.json");
    try {
      fs.mkdirSync(pluginData, { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(raw, null, 2) + "\n");
    } catch (err) {
      return { ok: false, key, error: `failed to write config.json: ${err}`, errorCode: 2 };
    }
    const defaults = loadConfig(pluginRoot, pluginData);
    const new_value = getConfigValue(defaults, key);
    const source = hasEnvOverride ? "env_var" : "default";
    const result: ConfigSetResult = { ok: true, key, old_value, new_value, source };
    if (hasEnvOverride && envVar) result.env_var = envVar;
    return result;
  }

  const validation = validateConfigValue(key, rawValue);
  if (!validation.ok) {
    return { ok: false, key, error: validation.error, errorCode: 1 };
  }

  const raw = loadRawConfig(pluginRoot, pluginData);
  raw[key] = validation.value;
  const configPath = path.join(pluginData, "config.json");
  try {
    fs.mkdirSync(pluginData, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(raw, null, 2) + "\n");
  } catch (err) {
    return { ok: false, key, error: `failed to write config.json: ${err}`, errorCode: 2 };
  }

  const source = hasEnvOverride ? "env_var" : "config_file";
  const result: ConfigSetResult = { ok: true, key, old_value, new_value: validation.value, source };
  if (hasEnvOverride && envVar) result.env_var = envVar;
  return result;
}
