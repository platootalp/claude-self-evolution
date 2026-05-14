import { loadState } from "../lib/state.js";
import type { State, Job } from "../types.js";

export function handleStatus(statePath: string): { sessions: Record<string, { count: number; pending_review: boolean }>; jobs: Job[] } {
  const state = loadState(statePath);
  return {
    sessions: state.sessions,
    jobs: state.jobs,
  };
}
