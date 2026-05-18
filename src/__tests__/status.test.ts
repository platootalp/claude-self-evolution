import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { handleStatus } from "../commands/status.js";
import { saveState } from "../lib/state.js";
import { saveStats } from "../lib/state.js";
import type { State, Stats } from "../types.js";


let tmpDir: string;
let statePath: string;
let statsPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-status-test-"));
  statePath = path.join(tmpDir, "state.json");
  statsPath = path.join(tmpDir, "stats.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("handleStatus", () => {
  it("returns active sessions and jobs from state", () => {
    const state: State = {
      sessions: { s1: { count: 5, pending_review: false } },
      jobs: [],
    };
    saveState(statePath, state);
    const result = handleStatus(statePath, statsPath);
    expect(result.active.sessions["s1"].count).toBe(5);
  });

  it("returns stats from stats.json when available", () => {
    const stats: Stats = {
      last_updated: "2026-05-14T12:00:00Z",
      total_sessions: 10,
      total_created: 3,
      total_updated: 1,
      total_skipped: 6,
      skip_reasons: { "too specific": 4 },
      recent_decisions: [
        { ts: "2026-05-14T12:00:00Z", session_id: "s1", decision: "CREATED", detail: "test" },
      ],
    };
    saveStats(statsPath, stats);
    const result = handleStatus(statePath, statsPath);
    expect(result.stats).toBeDefined();
    expect(result.stats!.total_created).toBe(3);
    expect(result.stats!.recent_decisions).toHaveLength(1);
  });

  it("returns null stats when stats.json does not exist", () => {
    const result = handleStatus(statePath, statsPath);
    expect(result.stats).toBeNull();
    expect(result.latest_review).toBeNull();
  });

  it("returns latest_review when there are recent decisions", () => {
    const state: State = {
      sessions: {},
      jobs: [],
    };
    saveState(statePath, state);
    const stats: Stats = {
      last_updated: "2026-05-14T12:00:00Z",
      total_sessions: 2,
      total_created: 1,
      total_updated: 0,
      total_skipped: 1,
      skip_reasons: { "too specific": 1 },
      recent_decisions: [
        { ts: "2026-05-14T12:00:00Z", session_id: "s2", decision: "SKIPPED", detail: "too specific" },
        { ts: "2026-05-14T11:00:00Z", session_id: "s1", decision: "CREATED", detail: "Created skill skill_name=foo", skill_name: "foo" },
      ],
    };
    saveStats(statsPath, stats);
    const result = handleStatus(statePath, statsPath);
    expect(result.latest_review).not.toBeNull();
    expect(result.latest_review!.action).toBe("SKIPPED");
    expect(result.latest_review!.rationale).toBe("too specific");
    expect(result.latest_review!.timestamp).toBe("2026-05-14T12:00:00Z");
  });

  it("returns latest_review with name when recent decision has skill_name", () => {
    const state: State = {
      sessions: {},
      jobs: [],
    };
    saveState(statePath, state);
    const stats: Stats = {
      last_updated: "2026-05-14T12:00:00Z",
      total_sessions: 1,
      total_created: 1,
      total_updated: 0,
      total_skipped: 0,
      skip_reasons: {},
      recent_decisions: [
        { ts: "2026-05-14T12:00:00Z", session_id: "s1", decision: "CREATED", detail: "Created skill skill_name=bar", skill_name: "bar" },
      ],
    };
    saveStats(statsPath, stats);
    const result = handleStatus(statePath, statsPath);
    expect(result.latest_review).not.toBeNull();
    expect(result.latest_review!.action).toBe("CREATED");
    expect(result.latest_review!.name).toBe("bar");
    expect(result.latest_review!.rationale).toBe("Created skill skill_name=bar");
  });
});
