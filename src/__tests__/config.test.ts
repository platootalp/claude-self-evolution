import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig, resolveConfig, resolveLogLevel } from "../lib/config.js";

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
