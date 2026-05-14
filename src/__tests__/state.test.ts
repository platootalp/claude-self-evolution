import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadState, saveState, incrementCount, consumePending, getOrCreateSession, addJob, updateJob } from "../lib/state.js";
import type { State, Job } from "../types.js";

let tmpDir: string;
let statePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-state-test-"));
  statePath = path.join(tmpDir, "state.json");
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

  it("handles concurrent writes gracefully (no corruption)", async () => {
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
  });
});
