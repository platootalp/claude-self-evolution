import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createLogger } from "../lib/logger.js";

let tmpDir: string;
let sessionsDir: string;
let sessionId: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-logger-test-"));
  sessionsDir = path.join(tmpDir, "sessions");
  sessionId = "test-session-1";
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("createLogger", () => {
  it("info writes when log_level=info", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    logger.info("hook_triggered", { event: "session_start" });
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.level).toBe("info");
    expect(entry.event).toBe("hook_triggered");
  });

  it("debug does NOT write when log_level=info", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    logger.debug("counter_state", { count: 5 });
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    expect(fs.existsSync(logPath)).toBe(false);
  });

  it("debug writes when log_level=debug", () => {
    const logger = createLogger(sessionsDir, sessionId, "debug");
    logger.debug("counter_state", { count: 5 });
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.level).toBe("debug");
    expect(entry.event).toBe("counter_state");
  });

  it("neither info nor debug writes when log_level=off", () => {
    const logger = createLogger(sessionsDir, sessionId, "off");
    logger.info("hook_triggered", {});
    logger.debug("counter_state", {});
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    expect(fs.existsSync(logPath)).toBe(false);
  });

  it("info writes when log_level=debug", () => {
    const logger = createLogger(sessionsDir, sessionId, "debug");
    logger.info("review_decision", { decision: "CREATED" });
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.level).toBe("info");
  });

  it("entries include session_id field", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    logger.info("hook_triggered", {});
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const entry = JSON.parse(fs.readFileSync(logPath, "utf-8").trim());
    expect(entry.session_id).toBe(sessionId);
  });

  it("entries include timestamp and pid", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    logger.info("test_event", {});
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const entry = JSON.parse(fs.readFileSync(logPath, "utf-8").trim());
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.pid).toBeTypeOf("number");
  });

  it("multiple calls append to same log file", () => {
    const logger = createLogger(sessionsDir, sessionId, "debug");
    logger.info("event1", {});
    logger.debug("event2", {});
    logger.info("event3", {});
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(3);
  });

  it("does not throw on impossible path", () => {
    const logger = createLogger("/dev/null/impossible", sessionId, "info");
    expect(() => logger.info("test", {})).not.toThrow();
  });

  it("logDecision is a convenience for info-level review_decision", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    logger.logDecision("CREATED", "3-step workflow", 1500);
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const entry = JSON.parse(fs.readFileSync(logPath, "utf-8").trim());
    expect(entry.event).toBe("review_decision");
    expect(entry.decision).toBe("CREATED");
    expect(entry.detail).toBe("3-step workflow");
    expect(entry.duration_ms).toBe(1500);
  });
});
