import fs from "node:fs";
import path from "node:path";
import type { State, Job, SessionState, SessionStateFull, Stats, RecentDecision } from "../types.js";

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

export function getOrCreateSession(statePath: string, sessionId: string): SessionState {
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
  // Sync to per-session state
  syncToSessionState(statePath, sessionId, state.sessions[sessionId]);
  return state.sessions[sessionId].count;
}

export function resetCount(
  statePath: string,
  sessionId: string
): void {
  const state = loadState(statePath);
  if (!state.sessions[sessionId]) {
    state.sessions[sessionId] = { count: 0, pending_review: false };
  }
  state.sessions[sessionId].count = 0;
  state.sessions[sessionId].pending_review = false;
  saveState(statePath, state);
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
    // Sync to per-session state
    syncToSessionState(statePath, sessionId, state.sessions[sessionId]);
    return true;
  }
  return false;
}

export function addJob(statePath: string, job: Job): void {
  const state = loadState(statePath);
  state.jobs.push(job);
  // Prune completed/failed jobs to prevent unbounded growth
  const running = state.jobs.filter((j) => j.status === "running");
  const finished = state.jobs.filter((j) => j.status !== "running");
  if (finished.length > MAX_COMPLETED_JOBS) {
    state.jobs = [...running, ...finished.slice(-MAX_COMPLETED_JOBS)];
  }
  saveState(statePath, state);
}

export function pruneJobs(statePath: string): void {
  const state = loadState(statePath);
  const running = state.jobs.filter((j) => j.status === "running");
  const finished = state.jobs.filter((j) => j.status !== "running");
  if (finished.length > MAX_COMPLETED_JOBS) {
    state.jobs = [...running, ...finished.slice(-MAX_COMPLETED_JOBS)];
    saveState(statePath, state);
  }
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

// ─── Root ↔ Per-Session Sync ─────────────────────────────────────────

function syncToSessionState(statePath: string, sessionId: string, sessionState: SessionState): void {
  const pluginData = path.dirname(statePath);
  const sessionsDir = path.join(pluginData, "sessions");
  try {
    const existing = loadSessionState(sessionsDir, sessionId);
    existing.count = sessionState.count;
    existing.pending_review = sessionState.pending_review;
    saveSessionState(sessionsDir, sessionId, existing);
  } catch {
    // Best-effort: per-session state is a mirror, not critical
  }
}

// ─── Per-Session State ───────────────────────────────────────────────

export function initSessionState(
  sessionsDir: string,
  sessionId: string,
  partial: Partial<SessionStateFull> = {}
): void {
  const dir = path.join(sessionsDir, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const state: SessionStateFull = {
    count: 0,
    pending_review: false,
    start_ts: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    ...partial,
  };
  const statePath = path.join(dir, "state.json");
  const tmpPath = statePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmpPath, statePath);
}

export function loadSessionState(
  sessionsDir: string,
  sessionId: string
): SessionStateFull {
  const statePath = path.join(sessionsDir, sessionId, "state.json");
  try {
    const raw = fs.readFileSync(statePath, "utf-8");
    return JSON.parse(raw) as SessionStateFull;
  } catch {
    return { count: 0, pending_review: false };
  }
}

export function saveSessionState(
  sessionsDir: string,
  sessionId: string,
  state: SessionStateFull
): void {
  const dir = path.join(sessionsDir, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const statePath = path.join(dir, "state.json");
  const tmpPath = statePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmpPath, statePath);
}

export function updateSessionResult(
  sessionsDir: string,
  sessionId: string,
  result: Required<Pick<SessionStateFull, "review_decision">> & Partial<SessionStateFull>
): void {
  const state = loadSessionState(sessionsDir, sessionId);
  Object.assign(state, result, { end_ts: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") });
  saveSessionState(sessionsDir, sessionId, state);
}

// ─── Stats ───────────────────────────────────────────────────────────

const EMPTY_STATS: Stats = {
  last_updated: "",
  total_sessions: 0,
  total_created: 0,
  total_updated: 0,
  total_skipped: 0,
  total_deleted: 0,
  skip_reasons: {},
  recent_decisions: [],
};

const MAX_RECENT_DECISIONS = 50;
const MAX_COMPLETED_JOBS = 100;

export function loadStats(statsPath: string): Stats {
  try {
    const raw = fs.readFileSync(statsPath, "utf-8");
    const stats = JSON.parse(raw) as Stats;
    // Migration: ensure total_deleted exists on old stats files
    if (stats.total_deleted === undefined) {
      stats.total_deleted = 0;
    }
    return stats;
  } catch {
    return { ...EMPTY_STATS, skip_reasons: {}, recent_decisions: [] };
  }
}

export function saveStats(statsPath: string, stats: Stats): void {
  const dir = path.dirname(statsPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = statsPath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(stats, null, 2), "utf-8");
  fs.renameSync(tmpPath, statsPath);
}

export function updateStats(
  statsPath: string,
  decision: "CREATED" | "UPDATED" | "SKIPPED" | "DELETED",
  detail: string,
  sessionId: string,
  skillName?: string
): void {
  const stats = loadStats(statsPath);
  stats.last_updated = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  stats.total_sessions += 1;

  if (decision === "CREATED") stats.total_created += 1;
  else if (decision === "UPDATED") stats.total_updated += 1;
  else if (decision === "SKIPPED") {
    stats.total_skipped += 1;
    stats.skip_reasons[detail] = (stats.skip_reasons[detail] ?? 0) + 1;
  } else if (decision === "DELETED") {
    stats.total_deleted += 1;
  }

  const rd: RecentDecision = {
    ts: stats.last_updated,
    session_id: sessionId,
    decision,
    detail,
    ...(skillName ? { skill_name: skillName } : {}),
  };
  stats.recent_decisions.unshift(rd);
  if (stats.recent_decisions.length > MAX_RECENT_DECISIONS) {
    stats.recent_decisions = stats.recent_decisions.slice(0, MAX_RECENT_DECISIONS);
  }

  saveStats(statsPath, stats);
}
