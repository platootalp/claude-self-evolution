import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { handlePostToolUse } from "../commands/post-tool-use.js";
import { loadState } from "../lib/state.js";
import { createLogger } from "../lib/logger.js";

let tmpDir: string;
let statePath: string;
let sessionsDir: string;
let sessionId: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-ptu-test-"));
  statePath = path.join(tmpDir, "state.json");
  sessionsDir = path.join(tmpDir, "sessions");
  sessionId = "test-session-1";
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("handlePostToolUse with logging", () => {
  it("increments count and writes debug log", () => {
    const logger = createLogger(sessionsDir, sessionId, "debug");
    const count = handlePostToolUse(statePath, sessionsDir, { session_id: "s1", tool_name: "Bash", tool_input: {} }, logger, 10);
    expect(count).toBe(1);
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const entry = JSON.parse(fs.readFileSync(logPath, "utf-8").trim());
    expect(entry.event).toBe("counter_state");
  });

  it("writes info hook_triggered when pending_review flips to true", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    for (let i = 0; i < 10; i++) {
      handlePostToolUse(statePath, sessionsDir, { session_id: "s1", tool_name: "Bash", tool_input: {} }, logger, 10);
    }
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    const hookLine = lines.find((l) => JSON.parse(l).event === "hook_triggered");
    expect(hookLine).toBeDefined();
    const entry = JSON.parse(hookLine!);
    expect(entry.event).toBe("hook_triggered");
    expect(entry.pending).toBe(true);
  });

  it("does not write debug log when log_level=info", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    handlePostToolUse(statePath, sessionsDir, { session_id: "s1", tool_name: "Bash", tool_input: {} }, logger, 10);
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    expect(fs.existsSync(logPath)).toBe(false);
  });

  it("skips when session_id is empty", () => {
    const logger = createLogger(sessionsDir, sessionId, "debug");
    handlePostToolUse(statePath, sessionsDir, { session_id: "", tool_name: "Bash", tool_input: {} }, logger, 10);
    const state = loadState(statePath);
    expect(Object.keys(state.sessions)).toHaveLength(0);
  });
});
