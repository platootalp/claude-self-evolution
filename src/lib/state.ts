import fs from "node:fs";
import path from "node:path";
import type { State, Job } from "../types.js";

export function loadState(statePath: string): State {
  try {
    const raw = fs.readFileSync(statePath, "utf-8");
    return JSON.parse(raw) as State;
  } catch {
    return { sessions: {}, jobs: [] };
  }
}

export function saveState(statePath: string, state: State): void {
  const dir = path.dirname(statePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = statePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmpPath, statePath);
}

export function getOrCreateSession(statePath: string, sessionId: string) {
  const state = loadState(statePath);
  if (!state.sessions[sessionId]) {
    state.sessions[sessionId] = { count: 0, pending_review: false };
    saveState(statePath, state);
  }
  return state.sessions[sessionId];
}

export function incrementCount(
  statePath: string,
  sessionId: string,
  threshold: number = 10
): number {
  const state = loadState(statePath);
  if (!state.sessions[sessionId]) {
    state.sessions[sessionId] = { count: 0, pending_review: false };
  }
  const newCount = state.sessions[sessionId].count + 1;
  if (newCount >= threshold) {
    state.sessions[sessionId].count = 0;
    state.sessions[sessionId].pending_review = true;
  } else {
    state.sessions[sessionId].count = newCount;
  }
  saveState(statePath, state);
  return state.sessions[sessionId].count;
}

export function consumePending(
  statePath: string,
  sessionId: string
): boolean {
  const state = loadState(statePath);
  if (!state.sessions[sessionId]) {
    return false;
  }
  if (state.sessions[sessionId].pending_review) {
    state.sessions[sessionId].pending_review = false;
    saveState(statePath, state);
    return true;
  }
  return false;
}

export function addJob(statePath: string, job: Job): void {
  const state = loadState(statePath);
  state.jobs.push(job);
  saveState(statePath, state);
}

export function updateJob(
  statePath: string,
  jobId: string,
  updates: Partial<Job>
): void {
  const state = loadState(statePath);
  const idx = state.jobs.findIndex((j) => j.id === jobId);
  if (idx !== -1) {
    Object.assign(state.jobs[idx], updates);
    saveState(statePath, state);
  }
}
