import fs from "node:fs";
import path from "node:path";

export interface Config {
  nudge_interval: number;
  max_skill_size: number;
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
  max_skill_size: 15360,
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

export function loadConfig(pluginRoot: string): Config {
  for (const name of ["config.json", "config.default.json"]) {
    try {
      const raw = fs.readFileSync(path.join(pluginRoot, name), "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {}
  }
  return { ...DEFAULT_CONFIG };
}

export function resolveConfig(pluginRoot: string): Config {
  const config = loadConfig(pluginRoot);

  if (process.env.SELF_EVOLUTION_NUDGE_INTERVAL) config.nudge_interval = parseInt(process.env.SELF_EVOLUTION_NUDGE_INTERVAL, 10);
  if (process.env.SELF_EVOLUTION_MAX_SKILL_SIZE) config.max_skill_size = parseInt(process.env.SELF_EVOLUTION_MAX_SKILL_SIZE, 10);
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
