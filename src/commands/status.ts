import fs from "node:fs";
import { loadState, loadStats } from "../lib/state.js";
import type { State, Job, Stats } from "../types.js";

interface StatusResult {
  active: {
    sessions: Record<string, { count: number; pending_review: boolean }>;
    jobs: Job[];
  };
  stats: Stats | null;
}

export function handleStatus(statePath: string, statsPath: string): StatusResult {
  const state: State = loadState(statePath);
  let stats: Stats | null = null;
  if (fs.existsSync(statsPath)) {
    stats = loadStats(statsPath);
  }
  return {
    active: {
      sessions: state.sessions,
      jobs: state.jobs,
    },
    stats,
  };
}
