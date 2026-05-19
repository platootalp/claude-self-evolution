import fs from "node:fs";
import { loadState, loadStats, pruneJobs } from "../lib/state.js";
import type { State, Job, Stats, RecentDecision } from "../types.js";

interface LatestReview {
  action: string;
  name?: string;
  rationale: string;
  timestamp: string;
}

interface StatusResult {
  active: {
    sessions: Record<string, { count: number; pending_review: boolean }>;
    jobs: Job[];
  };
  stats: Stats | null;
  latest_review: LatestReview | null;
}

export function handleStatus(statePath: string, statsPath: string): StatusResult {
  pruneJobs(statePath);
  const state: State = loadState(statePath);
  let stats: Stats | null = null;
  let latestReview: LatestReview | null = null;

  if (fs.existsSync(statsPath)) {
    stats = loadStats(statsPath);
    if (stats.recent_decisions && stats.recent_decisions.length > 0) {
      const latest = stats.recent_decisions[0];
      latestReview = {
        action: latest.decision,
        ...(latest.skill_name ? { name: latest.skill_name } : {}),
        rationale: latest.detail,
        timestamp: latest.ts,
      };
    }
  }

  return {
    active: {
      sessions: state.sessions,
      jobs: state.jobs,
    },
    stats,
    latest_review: latestReview,
  };
}
