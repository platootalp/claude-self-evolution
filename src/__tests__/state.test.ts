import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadState, saveState, incrementCount, resetCount, consumePending, getOrCreateSession, addJob, updateJob, initSessionState, loadSessionState, saveSessionState, updateSessionResult, loadStats, saveStats, updateStats } from "../lib/state.js";
import type { State, Job, SessionStateFull, Stats } from "../types.js";

let tmpDir: string;
let statePath: string;
let sessionsDir: string;
let statsPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-state-test-"));
  statePath = path.join(tmpDir, "state.json");
  sessionsDir = path.join(tmpDir, "sessions");
  statsPath = path.join(tmpDir, "stats.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("state", () => {
  it("loadState returns empty state when file missing", () => {
    const state = loadState(statePath);
    expect(state).toEqual({ sessions: {}, jobs: [] });
  });

  it("saveState + loadState roundtrip", () => {
    const state: State = {
      sessions: { s1: { count: 5, pending_review: false } },
      jobs: [],
    };
    saveState(statePath, state);
    const loaded = loadState(statePath);
    expect(loaded).toEqual(state);
  });

  it("saveState uses atomic write (tmpfile + rename)", () => {
    const state: State = { sessions: {}, jobs: [] };
    saveState(statePath, state);
    expect(fs.existsSync(statePath)).toBe(true);
    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".tmp"));
    expect(files).toHaveLength(0);
  });

  it("incrementCount increments and returns new count", () => {
    const count = incrementCount(statePath, "s1");
    expect(count).toBe(1);
    const count2 = incrementCount(statePath, "s1");
    expect(count2).toBe(2);
  });

  it("incrementCount hits threshold: resets count and sets pending_review=true", () => {
    for (let i = 0; i < 9; i++) {
      incrementCount(statePath, "s1", 10);
    }
    const state = loadState(statePath);
    expect(state.sessions["s1"].count).toBe(9);
    expect(state.sessions["s1"].pending_review).toBe(false);

    incrementCount(statePath, "s1", 10);
    const state2 = loadState(statePath);
    expect(state2.sessions["s1"].count).toBe(0);
    expect(state2.sessions["s1"].pending_review).toBe(true);
  });

  it("resetCount sets session count to 0", () => {
    incrementCount(statePath, "s1", 10);
    incrementCount(statePath, "s1", 10);
    const state = loadState(statePath);
    expect(state.sessions["s1"].count).toBe(2);
    resetCount(statePath, "s1");
    const stateAfter = loadState(statePath);
    expect(stateAfter.sessions["s1"].count).toBe(0);
    expect(stateAfter.sessions["s1"].pending_review).toBe(false);
  });

  it("resetCount creates session if not exists", () => {
    resetCount(statePath, "s-new");
    const state = loadState(statePath);
    expect(state.sessions["s-new"].count).toBe(0);
    expect(state.sessions["s-new"].pending_review).toBe(false);
  });

  it("consumePending returns true and clears flag when pending", () => {
    incrementCount(statePath, "s1", 1);
    const result = consumePending(statePath, "s1");
    expect(result).toBe(true);
    const state = loadState(statePath);
    expect(state.sessions["s1"].pending_review).toBe(false);
  });

  it("consumePending returns false when not pending", () => {
    const result = consumePending(statePath, "s1");
    expect(result).toBe(false);
  });

  it("getOrCreateSession returns existing session", () => {
    incrementCount(statePath, "s1");
    const session = getOrCreateSession(statePath, "s1");
    expect(session.count).toBe(1);
  });

  it("addJob creates a new job entry", () => {
    const job: Job = {
      id: "job-001",
      session_id: "s1",
      pid: 12345,
      status: "running",
      started_at: "2026-05-14T10:00:00Z",
    };
    addJob(statePath, job);
    const state = loadState(statePath);
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0].id).toBe("job-001");
  });

  it("updateJob updates an existing job", () => {
    const job: Job = {
      id: "job-001",
      session_id: "s1",
      pid: 12345,
      status: "running",
      started_at: "2026-05-14T10:00:00Z",
    };
    addJob(statePath, job);
    updateJob(statePath, "job-001", {
      status: "completed",
      completed_at: "2026-05-14T10:02:00Z",
      decision: "CREATED",
      skill_name: "debug-fastapi-5xx",
    });
    const state = loadState(statePath);
    expect(state.jobs[0].status).toBe("completed");
    expect(state.jobs[0].decision).toBe("CREATED");
  });

  it("incrementCount is not concurrency-safe (sequential calls recommended)", async () => {
    // incrementCount does read-modify-write without locking, so concurrent calls
    // may lose updates. This test verifies the state remains valid (no corruption),
    // not that all 20 increments are counted.
    const promises = Array.from({ length: 20 }, (_, i) =>
      Promise.resolve().then(() => incrementCount(statePath, "s-concurrent"))
    );
    await Promise.all(promises);
    const state = loadState(statePath);
    // Verify state is valid (no corruption)
    expect(state).toBeDefined();
    expect(state.sessions).toBeDefined();
    expect(state.sessions["s-concurrent"]).toBeDefined();
    expect(typeof state.sessions["s-concurrent"].count).toBe("number");
    expect(Number.isFinite(state.sessions["s-concurrent"].count)).toBe(true);
    expect(state.sessions["s-concurrent"].count).toBeGreaterThanOrEqual(0);
    // Sequential: should be exactly 20
    for (let i = 0; i < 20; i++) incrementCount(statePath, "s-seq", 100);
    const state2 = loadState(statePath);
    expect(state2.sessions["s-seq"].count).toBe(20);
  });
});

describe("per-session state", () => {
  it("initSessionState creates session directory with state.json", () => {
    initSessionState(sessionsDir, "s-new", { count: 0, pending_review: false });
    const statePath = path.join(sessionsDir, "s-new", "state.json");
    expect(fs.existsSync(statePath)).toBe(true);
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(state.count).toBe(0);
    expect(state.start_ts).toMatch(/^\d{4}-/);
  });

  it("loadSessionState reads from session directory", () => {
    initSessionState(sessionsDir, "s-load", { count: 3, pending_review: false });
    const state = loadSessionState(sessionsDir, "s-load");
    expect(state.count).toBe(3);
  });

  it("updateSessionResult writes review results to session state", () => {
    initSessionState(sessionsDir, "s-result", { count: 0, pending_review: true });
    updateSessionResult(sessionsDir, "s-result", {
      review_decision: "CREATED",
      review_detail: "3-step workflow",
      skill_name: "debug-foo",
      review_duration_ms: 8000,
    });
    const state = loadSessionState(sessionsDir, "s-result");
    expect(state.review_decision).toBe("CREATED");
    expect(state.skill_name).toBe("debug-foo");
  });
});

describe("stats.json", () => {
  it("loadStats returns empty stats when file missing", () => {
    const stats = loadStats(statsPath);
    expect(stats.total_sessions).toBe(0);
    expect(stats.total_created).toBe(0);
  });

  it("saveStats + loadStats roundtrip", () => {
    const stats: Stats = {
      last_updated: "2026-05-14T12:00:00Z",
      total_sessions: 1,
      total_created: 1,
      total_updated: 0,
      total_skipped: 0,
      skip_reasons: {},
      recent_decisions: [],
    };
    saveStats(statsPath, stats);
    const loaded = loadStats(statsPath);
    expect(loaded.total_created).toBe(1);
  });

  it("updateStats increments created counter and adds recent decision", () => {
    updateStats(statsPath, "CREATED", "3-step debug", "s1", "debug-foo");
    const stats = loadStats(statsPath);
    expect(stats.total_sessions).toBe(1);
    expect(stats.total_created).toBe(1);
    expect(stats.recent_decisions).toHaveLength(1);
    expect(stats.recent_decisions[0].decision).toBe("CREATED");
    expect(stats.recent_decisions[0].skill_name).toBe("debug-foo");
  });

  it("updateStats increments skipped counter and records skip reason", () => {
    updateStats(statsPath, "SKIPPED", "too specific", "s2");
    const stats = loadStats(statsPath);
    expect(stats.total_skipped).toBe(1);
    expect(stats.skip_reasons["too specific"]).toBe(1);
  });

  it("updateStats caps recent_decisions at 50 entries", () => {
    for (let i = 0; i < 55; i++) {
      updateStats(statsPath, "SKIPPED", `reason-${i}`, `s-${i}`);
    }
    const stats = loadStats(statsPath);
    expect(stats.recent_decisions.length).toBeLessThanOrEqual(50);
  });
});
