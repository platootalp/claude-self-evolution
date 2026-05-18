import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig, resolveConfig, resolveLogLevel, CONFIG_SCHEMA, getEnvVarName, loadRawConfig, validateConfigValue } from "../lib/config.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-config-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.SELF_EVOLUTION_LOG_LEVEL;
  delete process.env.SELF_EVOLUTION_NUDGE_INTERVAL;
  delete process.env.SELF_EVOLUTION_REVIEW_MAX_TURNS;
  delete process.env.SELF_EVOLUTION_MAX_SKILL_FILE_SIZE;
  delete process.env.SELF_EVOLUTION_MAX_SKILL_TOTAL_SIZE;
  delete process.env.SELF_EVOLUTION_MAX_FILES_PER_SKILL;
});

describe("config", () => {
  it("loadConfig returns defaults when no config file exists", () => {
    const config = loadConfig(tmpDir);
    expect(config.nudge_interval).toBe(10);
    expect(config.log_level).toBe("info");
  });

  it("loadConfig reads config.json from pluginRoot", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({ log_level: "debug", nudge_interval: 5 }));
    const config = loadConfig(tmpDir);
    expect(config.log_level).toBe("debug");
    expect(config.nudge_interval).toBe(5);
    expect(config.max_skill_file_size).toBe(262144);
  });

  it("resolveConfig applies env var overrides", () => {
    process.env.SELF_EVOLUTION_LOG_LEVEL = "off";
    process.env.SELF_EVOLUTION_NUDGE_INTERVAL = "3";
    const config = resolveConfig(tmpDir);
    expect(config.log_level).toBe("off");
    expect(config.nudge_interval).toBe(3);
  });

  it("resolveLogLevel returns valid levels as-is", () => {
    expect(resolveLogLevel({ log_level: "off" } as any)).toBe("off");
    expect(resolveLogLevel({ log_level: "info" } as any)).toBe("info");
    expect(resolveLogLevel({ log_level: "debug" } as any)).toBe("debug");
  });

  it("resolveLogLevel defaults invalid values to info", () => {
    expect(resolveLogLevel({ log_level: "verbose" } as any)).toBe("info");
    expect(resolveLogLevel({ log_level: "" } as any)).toBe("info");
  });

  it("config has review_max_turns default of 8", () => {
    const config = loadConfig(tmpDir);
    expect(config.review_max_turns).toBe(8);
  });

  it("resolveConfig applies SELF_EVOLUTION_REVIEW_MAX_TURNS env override", () => {
    process.env.SELF_EVOLUTION_REVIEW_MAX_TURNS = "12";
    const config = resolveConfig(tmpDir);
    expect(config.review_max_turns).toBe(12);
    delete process.env.SELF_EVOLUTION_REVIEW_MAX_TURNS;
  });
});

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
  it("returns empty object when config.json is not an object", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), '"hello"');
    const raw = loadRawConfig(tmpDir);
    expect(raw).toEqual({});
  });
  it("returns empty object when config.json is an array", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), "[1,2,3]");
    const raw = loadRawConfig(tmpDir);
    expect(raw).toEqual({});
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
  it("rejects non-string elements in array", () => {
    const result = validateConfigValue("category_whitelist", "[1,2,3]");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("strings");
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
