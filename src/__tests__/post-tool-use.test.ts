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
    expect(entry.hook).toBe("post_tool_use");
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

  it("respects custom threshold", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    handlePostToolUse(statePath, sessionsDir, { session_id: "s1", tool_name: "Bash", tool_input: {} }, logger, 1);
    const state = loadState(statePath);
    expect(state.sessions["s1"].pending_review).toBe(true);
  });

  it("skips increment when SELF_EVOLUTION_REVIEW_MODE is set", () => {
    const originalEnv = process.env.SELF_EVOLUTION_REVIEW_MODE;
    process.env.SELF_EVOLUTION_REVIEW_MODE = "1";
    try {
      const logger = createLogger(sessionsDir, sessionId, "info");
      const count = handlePostToolUse(statePath, sessionsDir, { session_id: "s1", tool_name: "Bash", tool_input: {} }, logger, 10);
      expect(count).toBe(0);
      const state = loadState(statePath);
      expect(state.sessions["s1"]).toBeUndefined();
    } finally {
      if (originalEnv === undefined) {
        delete process.env.SELF_EVOLUTION_REVIEW_MODE;
      } else {
        process.env.SELF_EVOLUTION_REVIEW_MODE = originalEnv;
      }
    }
  });

  it("resets counter to 0 when tool_name is Skill", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    handlePostToolUse(statePath, sessionsDir, { session_id: "s1", tool_name: "Bash", tool_input: {} }, logger, 10);
    handlePostToolUse(statePath, sessionsDir, { session_id: "s1", tool_name: "Bash", tool_input: {} }, logger, 10);
    const state1 = loadState(statePath);
    expect(state1.sessions["s1"].count).toBe(2);
    handlePostToolUse(statePath, sessionsDir, { session_id: "s1", tool_name: "Skill", tool_input: {} }, logger, 10);
    const state2 = loadState(statePath);
    expect(state2.sessions["s1"].count).toBe(0);
  });

  it("Skill tool use returns 0 and does not trigger nudge", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    for (let i = 0; i < 9; i++) {
      handlePostToolUse(statePath, sessionsDir, { session_id: "s1", tool_name: "Bash", tool_input: {} }, logger, 10);
    }
    const state1 = loadState(statePath);
    expect(state1.sessions["s1"].count).toBe(9);
    expect(state1.sessions["s1"].pending_review).toBe(false);
    handlePostToolUse(statePath, sessionsDir, { session_id: "s1", tool_name: "Skill", tool_input: {} }, logger, 10);
    const state2 = loadState(statePath);
    expect(state2.sessions["s1"].count).toBe(0);
    expect(state2.sessions["s1"].pending_review).toBe(false);
  });
});
