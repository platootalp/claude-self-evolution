import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { logEvent, logDecision } from "../lib/logger.js";

let tmpDir: string;
let logPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-logger-test-"));
  logPath = path.join(tmpDir, "self-evolution.jsonl");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("logger", () => {
  it("logEvent writes a JSONL line with required fields", () => {
    logEvent(logPath, "info", "diag_hook_fired", { CLAUDE_PLUGIN_ROOT: "/test" });
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.level).toBe("info");
    expect(entry.event).toBe("diag_hook_fired");
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.pid).toBeTypeOf("number");
    expect(entry.CLAUDE_PLUGIN_ROOT).toBe("/test");
  });

  it("logDecision writes a reviewer_decision entry", () => {
    logDecision(logPath, "CREATED", "3-step workflow generalizable", 1500, "s1");
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.event).toBe("reviewer_decision");
    expect(entry.decision).toBe("CREATED");
    expect(entry.detail).toBe("3-step workflow generalizable");
    expect(entry.duration_ms).toBe(1500);
    expect(entry.session_id).toBe("s1");
  });

  it("multiple log calls append lines", () => {
    logEvent(logPath, "info", "event1", {});
    logEvent(logPath, "warn", "event2", {});
    logDecision(logPath, "SKIPPED", "trivial", 0, "");
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(3);
  });

  it("logEvent does not throw when directory creation fails", () => {
    expect(() => logEvent("/dev/null/impossible/path/log.jsonl", "info", "test", {})).not.toThrow();
  });
});
