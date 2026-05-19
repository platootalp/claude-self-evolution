import { resolveConfig, loadRawConfig, getEnvVarName, CONFIG_SCHEMA } from "../lib/config.js";
import type { Config } from "../lib/config.js";

export interface ConfigGetArgs {
  key: string;
}

export interface ConfigGetEntry {
  key: string;
  value: unknown;
  source: "default" | "config_file" | "env_var";
  env_var?: string;
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

function getConfigValue(resolved: Config, key: string): unknown {
  return (resolved as any)[key];
}

export function handleConfigGet(pluginRoot: string, pluginData: string, filterKey?: string): ConfigGetEntry[] {
  const resolved = resolveConfig(pluginRoot, pluginData);
  const raw = loadRawConfig(pluginRoot, pluginData);

  const validKeys = filterKey ? (CONFIG_SCHEMA[filterKey] ? [filterKey] : []) : Object.keys(CONFIG_SCHEMA);

  return validKeys.map((key) => {
    const envVar = getEnvVarName(key);
    let source: ConfigGetEntry["source"] = "default";
    let env_var: string | undefined;
    if (envVar && process.env[envVar]) {
      source = "env_var";
      env_var = envVar;
    } else if (key in raw) {
      source = "config_file";
    }
    return { key, value: getConfigValue(resolved, key), source, env_var };
  });
}
