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
  });
});
