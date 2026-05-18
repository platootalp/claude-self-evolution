import { resolveConfig, loadRawConfig, getEnvVarName, CONFIG_SCHEMA } from "../lib/config.js";
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

  const validKeys = filterKey ? (CONFIG_SCHEMA[filterKey] ? [filterKey] : []) : Object.keys(CONFIG_SCHEMA);

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
