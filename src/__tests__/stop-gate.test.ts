import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { handleStopGate } from "../commands/stop-gate.js";
import { loadState, incrementCount } from "../lib/state.js";
import { createLogger } from "../lib/logger.js";

let tmpDir: string;
let statePath: string;
let sessionsDir: string;
let sessionId: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-sg-test-"));
  statePath = path.join(tmpDir, "state.json");
  sessionsDir = path.join(tmpDir, "sessions");
  sessionId = "test-session-1";
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("handleStopGate", () => {
  it("returns allow without spawn when SELF_EVOLUTION_REVIEW_MODE is set", () => {
    const originalEnv = process.env.SELF_EVOLUTION_REVIEW_MODE;
    process.env.SELF_EVOLUTION_REVIEW_MODE = "1";
    incrementCount(statePath, "s1", 1);
    try {
      const logger = createLogger(sessionsDir, sessionId, "info");
      const result = handleStopGate(statePath, sessionsDir, sessionId, {
        session_id: "s1",
        transcript_path: "/tmp/transcript.jsonl",
        stop_hook_active: false,
      }, { pluginRoot: "/tmp", pluginData: tmpDir }, logger);
      expect(result.action).toBe("allow");
      expect(result.spawned).toBe(false);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.SELF_EVOLUTION_REVIEW_MODE;
      } else {
        process.env.SELF_EVOLUTION_REVIEW_MODE = originalEnv;
      }
    }
  });

  it("returns allow when stop_hook_active=true", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    const result = handleStopGate(statePath, sessionsDir, sessionId, {
      session_id: "s1",
      transcript_path: "/tmp/transcript.jsonl",
      stop_hook_active: true,
    }, { pluginRoot: "/tmp", pluginData: tmpDir }, logger);
    expect(result.action).toBe("allow");
    expect(result.spawned).toBe(false);
  });

  it("logs review_skipped when no pending review", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    handleStopGate(statePath, sessionsDir, sessionId, {
      session_id: "s1",
      transcript_path: "/tmp/transcript.jsonl",
      stop_hook_active: false,
    }, { pluginRoot: "/tmp", pluginData: tmpDir }, logger);
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const entry = JSON.parse(fs.readFileSync(logPath, "utf-8").trim());
    expect(entry.event).toBe("review_skipped");
    expect(entry.reason).toBe("no_pending_review");
  });

  it("consumes pending and logs review_launched with pid", async () => {
    incrementCount(statePath, "s1", 1);
    const logger = createLogger(sessionsDir, sessionId, "info");
    const result = handleStopGate(statePath, sessionsDir, sessionId, {
      session_id: "s1",
      transcript_path: "/tmp/transcript.jsonl",
      stop_hook_active: false,
    }, { pluginRoot: "/tmp", pluginData: tmpDir }, logger);
    expect(result.action).toBe("allow");
    expect(result.spawned).toBe(true);
    // Wait for async spawn to resolve and log
    await new Promise((r) => setTimeout(r, 100));
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const content = fs.readFileSync(logPath, "utf-8").trim();
    const entry = JSON.parse(content.split("\n")[0]);
    expect(entry.event).toBe("review_launched");
    expect(entry.session_id).toBe(sessionId);
    expect(entry.pid).toBeTypeOf("number");
  });

  it("logs spawn_launched debug event when log_level=debug", async () => {
    incrementCount(statePath, "s1", 1);
    const logger = createLogger(sessionsDir, sessionId, "debug");
    handleStopGate(statePath, sessionsDir, sessionId, {
      session_id: "s1",
      transcript_path: "/tmp/transcript.jsonl",
      stop_hook_active: false,
    }, { pluginRoot: "/tmp", pluginData: tmpDir }, logger);
    await new Promise((r) => setTimeout(r, 100));
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    const spawnLaunched = lines.map(l => JSON.parse(l)).find((e: any) => e.event === "spawn_launched");
    expect(spawnLaunched).toBeDefined();
    expect(spawnLaunched.pid).toBeTypeOf("number");
  });

  it("returns allow without spawn when session_id is empty", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    const result = handleStopGate(statePath, sessionsDir, sessionId, {
      session_id: "",
      transcript_path: "/tmp/transcript.jsonl",
      stop_hook_active: false,
    }, { pluginRoot: "/tmp", pluginData: tmpDir }, logger);
    expect(result.action).toBe("allow");
    expect(result.spawned).toBe(false);
  });

  it("returns allow without spawn when transcript_path is empty", () => {
    incrementCount(statePath, "s1", 1);
    const logger = createLogger(sessionsDir, sessionId, "info");
    const result = handleStopGate(statePath, sessionsDir, sessionId, {
      session_id: "s1",
      transcript_path: "",
      stop_hook_active: false,
    }, { pluginRoot: "/tmp", pluginData: tmpDir }, logger);
    expect(result.action).toBe("allow");
    expect(result.spawned).toBe(false);
  });
});
