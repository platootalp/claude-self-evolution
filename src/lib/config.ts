import fs from "node:fs";
import path from "node:path";

export interface Config {
  nudge_interval: number;
  review_model: string;
  platform: string;
  category_whitelist: string[];
  meta_skill_name: string;
  log_level: string;
  review_max_turns: number;
  max_skill_file_size: number;
  max_skill_total_size: number;
  max_files_per_skill: number;
  binary_extensions: string[];
}

const DEFAULT_CONFIG: Config = {
  nudge_interval: 10,
  review_model: "sonnet",
  platform: "auto",
  category_whitelist: ["debug", "refactor", "test", "deploy", "data", "web", "cli", "meta"],
  meta_skill_name: "evolve-skill-writer",
  log_level: "info",
  review_max_turns: 8,
  max_skill_file_size: 262144,
  max_skill_total_size: 1048576,
  max_files_per_skill: 50,
  binary_extensions: [".exe", ".dll", ".so", ".dylib", ".bin", ".bat", ".cmd", ".ps1", ".com"],
};

export function loadConfig(pluginRoot: string, pluginData?: string): Config {
  // Try pluginData first (writable runtime location), then pluginRoot
  for (const base of [pluginData, pluginRoot]) {
    if (!base) continue;
    for (const name of ["config.json", "config.default.json"]) {
      try {
        const raw = fs.readFileSync(path.join(base, name), "utf-8");
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      } catch {}
    }
  }
  return { ...DEFAULT_CONFIG };
}

export function resolveConfig(pluginRoot: string, pluginData?: string): Config {
  const config = loadConfig(pluginRoot, pluginData);

  if (process.env.SELF_EVOLUTION_NUDGE_INTERVAL) config.nudge_interval = parseInt(process.env.SELF_EVOLUTION_NUDGE_INTERVAL, 10);
  if (process.env.SELF_EVOLUTION_REVIEW_MODEL) config.review_model = process.env.SELF_EVOLUTION_REVIEW_MODEL;
  if (process.env.SELF_EVOLUTION_PLATFORM) config.platform = process.env.SELF_EVOLUTION_PLATFORM;
  if (process.env.SELF_EVOLUTION_LOG_LEVEL) config.log_level = process.env.SELF_EVOLUTION_LOG_LEVEL;
  if (process.env.SELF_EVOLUTION_REVIEW_MAX_TURNS) config.review_max_turns = parseInt(process.env.SELF_EVOLUTION_REVIEW_MAX_TURNS, 10);
  if (process.env.SELF_EVOLUTION_MAX_SKILL_FILE_SIZE) config.max_skill_file_size = parseInt(process.env.SELF_EVOLUTION_MAX_SKILL_FILE_SIZE, 10);
  if (process.env.SELF_EVOLUTION_MAX_SKILL_TOTAL_SIZE) config.max_skill_total_size = parseInt(process.env.SELF_EVOLUTION_MAX_SKILL_TOTAL_SIZE, 10);
  if (process.env.SELF_EVOLUTION_MAX_FILES_PER_SKILL) config.max_files_per_skill = parseInt(process.env.SELF_EVOLUTION_MAX_FILES_PER_SKILL, 10);

  return config;
}

export function resolveLogLevel(config: Config): string {
  const level = config.log_level.toLowerCase();
  if (level === "off" || level === "info" || level === "debug") return level;
  return "info";
}

// --- Schema, env mapping, raw loader, validation ---

export interface ConfigFieldSchema {
  type: "enum" | "int" | "string" | "string[]";
  enumValues?: string[];
  min?: number;
  max?: number;
  description: string;
}

export const CONFIG_SCHEMA: Record<string, ConfigFieldSchema> = {
  log_level: {
    type: "enum",
    enumValues: ["off", "info", "debug"],
    description: "Logging verbosity",
  },
  nudge_interval: {
    type: "int",
    min: 1,
    description: "Tool calls before review trigger",
  },
  review_model: {
    type: "enum",
    enumValues: ["sonnet", "opus", "haiku"],
    description: "Model for companion reviewer",
  },
  platform: {
    type: "enum",
    enumValues: ["auto", "claude-code", "codex", "cursor"],
    description: "Target platform",
  },
  category_whitelist: {
    type: "string[]",
    description: "Skill categories to extract",
  },
  meta_skill_name: {
    type: "string",
    description: "Name of the skill-writing meta-skill",
  },
  review_max_turns: {
    type: "int",
    min: 1,
    max: 20,
    description: "Max turns for companion review",
  },
  max_skill_file_size: {
    type: "int",
    min: 1024,
    description: "Max bytes per skill file",
  },
  max_skill_total_size: {
    type: "int",
    min: 1024,
    description: "Max total bytes per skill",
  },
  max_files_per_skill: {
    type: "int",
    min: 1,
    max: 100,
    description: "Max files per skill",
  },
  binary_extensions: {
    type: "string[]",
    description: "File extensions to block",
  },
};

export const ENV_VAR_MAP: Record<string, string> = {
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

export function loadRawConfig(pluginRoot: string, pluginData?: string): Record<string, unknown> {
  // Try pluginData first (writable runtime location), then pluginRoot
  for (const base of [pluginData, pluginRoot]) {
    if (!base) continue;
    try {
      const raw = fs.readFileSync(path.join(base, "config.json"), "utf-8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        continue;
      }
      return parsed;
    } catch {}
  }
  return {};
}

export interface ValidateResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export function validateConfigValue(key: string, rawValue: string): ValidateResult {
  const schema = CONFIG_SCHEMA[key];
  if (!schema) {
    return { ok: false, error: `unknown key: ${key}` };
  }

  switch (schema.type) {
    case "enum": {
      if (schema.enumValues && schema.enumValues.includes(rawValue)) {
        return { ok: true, value: rawValue };
      }
      return { ok: false, error: `must be one of: ${schema.enumValues.join(", ")}` };
    }
    case "int": {
      const n = Number(rawValue);
      if (!Number.isInteger(n)) {
        return { ok: false, error: "must be an integer" };
      }
      if (schema.min !== undefined && n < schema.min) {
        return { ok: false, error: `must be >= ${schema.min}` };
      }
      if (schema.max !== undefined && n > schema.max) {
        return { ok: false, error: `must be <= ${schema.max}` };
      }
      return { ok: true, value: n };
    }
    case "string": {
      if (rawValue.length === 0) {
        return { ok: false, error: "must be non-empty" };
      }
      return { ok: true, value: rawValue };
    }
    case "string[]": {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawValue);
      } catch {
        return { ok: false, error: "must be a JSON array of strings" };
      }
      if (!Array.isArray(parsed)) {
        return { ok: false, error: "must be a JSON array of strings" };
      }
      if (parsed.length === 0) {
        return { ok: false, error: "must be a non-empty array" };
      }
      if (parsed.some((item: unknown) => typeof item !== "string")) {
        return { ok: false, error: "must be a JSON array of strings" };
      }
      return { ok: true, value: parsed };
    }
  }
}
