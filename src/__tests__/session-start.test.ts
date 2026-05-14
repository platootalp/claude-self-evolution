import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { handleSessionStart } from "../commands/session-start.js";

let tmpDir: string;
let logPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-ss-test-"));
  logPath = path.join(tmpDir, "self-evolution.jsonl");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("handleSessionStart", () => {
  it("writes diagnostic log entry", () => {
    handleSessionStart(logPath, {
      CLAUDE_PLUGIN_ROOT: "/test/plugin",
      CLAUDE_PLUGIN_DATA: "/test/data",
    });
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.event).toBe("diag_hook_fired");
    expect(entry.CLAUDE_PLUGIN_ROOT).toBe("/test/plugin");
  });

  it("handles missing env vars gracefully", () => {
    handleSessionStart(logPath, {});
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.CLAUDE_PLUGIN_ROOT).toBe("EMPTY");
  });
});
