import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { handleSessionStart } from "../commands/session-start.js";
import { createLogger } from "../lib/logger.js";

let tmpDir: string;
let sessionsDir: string;
let sessionId: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-ss-test-"));
  sessionsDir = path.join(tmpDir, "sessions");
  sessionId = "test-session-1";
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("handleSessionStart", () => {
  it("creates session directory and writes info log", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    handleSessionStart(sessionsDir, sessionId, logger, {
      CLAUDE_PLUGIN_ROOT: "/test/plugin",
      CLAUDE_PLUGIN_DATA: "/test/data",
    });
    const statePath = path.join(sessionsDir, sessionId, "state.json");
    expect(fs.existsSync(statePath)).toBe(true);
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const entry = JSON.parse(fs.readFileSync(logPath, "utf-8").trim());
    expect(entry.event).toBe("hook_triggered");
    expect(entry.CLAUDE_PLUGIN_ROOT).toBe("/test/plugin");
  });

  it("writes counter_state debug log when log_level=debug", () => {
    const logger = createLogger(sessionsDir, sessionId, "debug");
    handleSessionStart(sessionsDir, sessionId, logger, {});
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    const debugEntry = JSON.parse(lines[1]);
    expect(debugEntry.event).toBe("counter_state");
    expect(debugEntry.level).toBe("debug");
  });

  it("does not write debug log when log_level=info", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    handleSessionStart(sessionsDir, sessionId, logger, {});
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
  });
});
