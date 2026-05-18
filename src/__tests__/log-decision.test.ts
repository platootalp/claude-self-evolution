import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { handleLogDecision } from "../commands/log-decision.js";
import { createLogger } from "../lib/logger.js";
import { loadStats, loadSessionState } from "../lib/state.js";

let tmpDir: string;
let sessionsDir: string;
let statsPath: string;
let sessionId: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-ld-test-"));
  sessionsDir = path.join(tmpDir, "sessions");
  statsPath = path.join(tmpDir, "stats.json");
  sessionId = "test-session-1";
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.mkdirSync(path.join(sessionsDir, sessionId), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("handleLogDecision", () => {
  it("logs review_summary event for CREATED decision", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    handleLogDecision(
      sessionsDir,
      statsPath,
      sessionId,
      "CREATED",
      "Created skill skill_name=my-skill",
      1200,
      logger
    );
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    const reviewSummary = lines
      .map((l) => JSON.parse(l))
      .find((e: any) => e.event === "review_summary");
    expect(reviewSummary).toBeDefined();
    expect(reviewSummary.action).toBe("CREATED");
    expect(reviewSummary.name).toBe("my-skill");
    expect(reviewSummary.rationale).toBe("Created skill skill_name=my-skill");
  });

  it("logs review_summary event for SKIPPED decision without name", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    handleLogDecision(
      sessionsDir,
      statsPath,
      sessionId,
      "SKIPPED",
      "Too specific",
      500,
      logger
    );
    const logPath = path.join(sessionsDir, sessionId, "log.jsonl");
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    const reviewSummary = lines
      .map((l) => JSON.parse(l))
      .find((e: any) => e.event === "review_summary");
    expect(reviewSummary).toBeDefined();
    expect(reviewSummary.action).toBe("SKIPPED");
    expect(reviewSummary.name).toBeUndefined();
    expect(reviewSummary.rationale).toBe("Too specific");
  });

  it("updates stats and session result for CREATED", () => {
    const logger = createLogger(sessionsDir, sessionId, "info");
    handleLogDecision(
      sessionsDir,
      statsPath,
      sessionId,
      "CREATED",
      "Created skill skill_name=my-skill",
      1200,
      logger
    );
    const stats = loadStats(statsPath);
    expect(stats.total_created).toBe(1);
    expect(stats.recent_decisions).toHaveLength(1);
    expect(stats.recent_decisions[0].skill_name).toBe("my-skill");
    const sessionState = loadSessionState(sessionsDir, sessionId);
    expect(sessionState.review_decision).toBe("CREATED");
  });
});
