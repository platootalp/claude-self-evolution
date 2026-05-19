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
    const result = handleConfigSet(tmpDir, tmpDir, "log_level", "debug");
    expect(result.ok).toBe(true);
    expect(result.key).toBe("log_level");
    expect(result.new_value).toBe("debug");
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, "config.json"), "utf-8"));
    expect(written.log_level).toBe("debug");
  });

  it("updates existing config.json preserving other keys", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({ nudge_interval: 5 }));
    const result = handleConfigSet(tmpDir, tmpDir, "log_level", "off");
    expect(result.ok).toBe(true);
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, "config.json"), "utf-8"));
    expect(written.log_level).toBe("off");
    expect(written.nudge_interval).toBe(5);
  });

  it("rejects invalid key", () => {
    const result = handleConfigSet(tmpDir, tmpDir, "nonexistent", "foo");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("unknown key");
  });

  it("rejects invalid value for enum", () => {
    const result = handleConfigSet(tmpDir, tmpDir, "log_level", "verbose");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("off");
  });

  it("rejects out-of-range int value", () => {
    const result = handleConfigSet(tmpDir, tmpDir, "nudge_interval", "0");
    expect(result.ok).toBe(false);
    expect(result.error).toContain(">=");
  });

  it("sets int value correctly", () => {
    const result = handleConfigSet(tmpDir, tmpDir, "nudge_interval", "5");
    expect(result.ok).toBe(true);
    expect(result.new_value).toBe(5);
  });

  it("sets array value correctly", () => {
    const result = handleConfigSet(tmpDir, tmpDir, "category_whitelist", '["debug","test"]');
    expect(result.ok).toBe(true);
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, "config.json"), "utf-8"));
    expect(written.category_whitelist).toEqual(["debug", "test"]);
  });

  it("resets a key by removing it from config.json", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({ log_level: "debug", nudge_interval: 5 }));
    const result = handleConfigSet(tmpDir, tmpDir, "log_level", "", true);
    expect(result.ok).toBe(true);
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, "config.json"), "utf-8"));
    expect(written.log_level).toBeUndefined();
    expect(written.nudge_interval).toBe(5);
  });

  it("reset returns default value as new_value", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({ log_level: "debug" }));
    const result = handleConfigSet(tmpDir, tmpDir, "log_level", "", true);
    expect(result.ok).toBe(true);
    expect(result.new_value).toBe("info");
  });

  it("reset returns default source when no env var", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({ log_level: "debug" }));
    const result = handleConfigSet(tmpDir, tmpDir, "log_level", "", true);
    expect(result.ok).toBe(true);
    expect(result.source).toBe("default");
  });

  it("reports old_value when changing existing key", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({ log_level: "debug" }));
    const result = handleConfigSet(tmpDir, tmpDir, "log_level", "off");
    expect(result.ok).toBe(true);
    expect(result.old_value).toBe("debug");
  });

  it("reports default as old_value when key not in config.json", () => {
    const result = handleConfigSet(tmpDir, tmpDir, "log_level", "debug");
    expect(result.ok).toBe(true);
    expect(result.old_value).toBe("info");
  });

  it("reports env_var source when env var is active", () => {
    process.env.SELF_EVOLUTION_LOG_LEVEL = "off";
    const result = handleConfigSet(tmpDir, tmpDir, "log_level", "debug");
    expect(result.ok).toBe(true);
    expect(result.source).toBe("env_var");
    expect(result.env_var).toBe("SELF_EVOLUTION_LOG_LEVEL");
  });

  it("writes pretty-printed JSON", () => {
    handleConfigSet(tmpDir, tmpDir, "log_level", "debug");
    const content = fs.readFileSync(path.join(tmpDir, "config.json"), "utf-8");
    expect(content).toContain("\n");
  });

  it("returns errorCode 1 for validation errors", () => {
    const result = handleConfigSet(tmpDir, tmpDir, "log_level", "verbose");
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe(1);
  });

  it("returns errorCode 1 for unknown key", () => {
    const result = handleConfigSet(tmpDir, tmpDir, "nonexistent", "foo");
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe(1);
  });

  it("returns errorCode 2 for write errors", () => {
    const readOnlyDir = path.join(tmpDir, "readonly");
    fs.mkdirSync(readOnlyDir);
    fs.chmodSync(readOnlyDir, 0o444);
    const result = handleConfigSet(readOnlyDir, readOnlyDir, "log_level", "debug");
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe(2);
  });
});
