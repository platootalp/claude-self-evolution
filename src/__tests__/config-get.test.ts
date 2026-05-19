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
    const result = handleConfigGet(tmpDir, tmpDir);
    const logLevel = result.find((r) => r.key === "log_level")!;
    expect(logLevel.value).toBe("info");
    expect(logLevel.source).toBe("default");
  });

  it("returns config_file source for keys in config.json", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({ log_level: "debug" }));
    const result = handleConfigGet(tmpDir, tmpDir);
    const logLevel = result.find((r) => r.key === "log_level")!;
    expect(logLevel.value).toBe("debug");
    expect(logLevel.source).toBe("config_file");
  });

  it("returns env_var source when env var is set", () => {
    process.env.SELF_EVOLUTION_LOG_LEVEL = "off";
    const result = handleConfigGet(tmpDir, tmpDir);
    const logLevel = result.find((r) => r.key === "log_level")!;
    expect(logLevel.value).toBe("off");
    expect(logLevel.source).toBe("env_var");
    expect(logLevel.env_var).toBe("SELF_EVOLUTION_LOG_LEVEL");
  });

  it("env_var source takes precedence over config_file", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({ log_level: "debug" }));
    process.env.SELF_EVOLUTION_LOG_LEVEL = "off";
    const result = handleConfigGet(tmpDir, tmpDir);
    const logLevel = result.find((r) => r.key === "log_level")!;
    expect(logLevel.value).toBe("off");
    expect(logLevel.source).toBe("env_var");
  });

  it("returns 11 entries (one per config key)", () => {
    const result = handleConfigGet(tmpDir, tmpDir);
    expect(result).toHaveLength(11);
  });

  it("with key filter returns single entry", () => {
    const result = handleConfigGet(tmpDir, tmpDir, "log_level");
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("log_level");
  });

  it("with invalid key returns empty array", () => {
    const result = handleConfigGet(tmpDir, tmpDir, "nonexistent");
    expect(result).toHaveLength(0);
  });

  it("does not include env_var field when source is default", () => {
    const result = handleConfigGet(tmpDir, tmpDir);
    const logLevel = result.find((r) => r.key === "log_level")!;
    expect(logLevel.env_var).toBeUndefined();
  });
});
