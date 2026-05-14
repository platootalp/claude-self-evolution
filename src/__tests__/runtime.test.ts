import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runCommand } from "../runtime.js";

let tmpDir: string;
let originalEnv: Record<string, string | undefined>;

describe("runtime command router", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-rt-test-"));
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("routes session-start correctly", () => {
    process.env.CLAUDE_PLUGIN_ROOT = tmpDir;
    process.env.CLAUDE_PLUGIN_DATA = tmpDir;
    const result = runCommand("session-start", [], "{}");
    expect(result).toBe(0);
  });

  it("routes post-tool-use correctly", () => {
    process.env.CLAUDE_PLUGIN_ROOT = tmpDir;
    process.env.CLAUDE_PLUGIN_DATA = tmpDir;
    const result = runCommand(
      "post-tool-use",
      [],
      JSON.stringify({ session_id: "test", tool_name: "Bash", tool_input: {} })
    );
    expect(result).toBe(0);
  });

  it("routes security-scan correctly", () => {
    process.env.CLAUDE_PLUGIN_ROOT = tmpDir;
    process.env.CLAUDE_PLUGIN_DATA = tmpDir;
    const result = runCommand(
      "security-scan",
      ["--path", path.join(tmpDir, "test.md"), "--content", "safe content"],
      ""
    );
    expect(result).toBe(0);
  });

  it("routes status correctly", () => {
    process.env.CLAUDE_PLUGIN_ROOT = tmpDir;
    process.env.CLAUDE_PLUGIN_DATA = tmpDir;
    const result = runCommand("status", [], "");
    expect(result).toBe(0);
  });

  it("routes log-decision correctly", () => {
    process.env.CLAUDE_PLUGIN_ROOT = tmpDir;
    process.env.CLAUDE_PLUGIN_DATA = tmpDir;
    const result = runCommand("log-decision", ["CREATED", "test reason"], "");
    expect(result).toBe(0);
  });

  it("returns exit code 1 for unknown commands", () => {
    process.env.CLAUDE_PLUGIN_ROOT = tmpDir;
    process.env.CLAUDE_PLUGIN_DATA = tmpDir;
    const result = runCommand("nonexistent", [], "{}");
    expect(result).toBe(1);
  });
});
