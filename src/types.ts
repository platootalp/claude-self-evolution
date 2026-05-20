// ─── State ──────────────────────────────────────────────────────────

export interface SessionState {
  count: number;
  pending_review: boolean;
}

export interface Job {
  id: string;
  session_id: string;
  pid: number;
  status: "running" | "completed" | "failed";
  started_at: string;
  completed_at?: string;
  decision?: "CREATED" | "UPDATED" | "SKIPPED" | "DELETED";
  skill_name?: string;
}

export interface State {
  sessions: Record<string, SessionState>;
  jobs: Job[];
}

// ─── Security ───────────────────────────────────────────────────────

export interface ScanResult {
  allowed: boolean;
  reason?: string;
  matches?: SecurityMatch[];
}

export interface SecurityPattern {
  id: string;
  severity: "dangerous" | "caution" | "safe";
  category: string;
  pattern: RegExp;
  description: string;
}

export interface SecurityMatch {
  id: string;
  severity: "dangerous" | "caution" | "safe";
  category: string;
  description: string;
}

export type TrustLevel = "agent-created" | "community" | "trusted";

// ─── Transcript ─────────────────────────────────────────────────────

export interface TranscriptToolCall {
  tool: string;
  input: Record<string, unknown>;
  output?: string;
}

export interface TranscriptSummary {
  toolCalls: TranscriptToolCall[];
  userMessages: string[];
  assistantMessages: string[];
  totalTurns: number;
}

// ─── Hook Inputs ────────────────────────────────────────────────────

export interface HookInput {
  session_id: string;
}

export interface PostToolUseInput extends HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface StopInput extends HookInput {
  transcript_path: string;
  stop_hook_active: boolean;
}

// ─── Platform Adapter ───────────────────────────────────────────────

import type { ChildProcess } from "node:child_process";

export type PlatformName = "claude-code" | "codex" | "cursor";

export interface NormalizedHookInput {
  sessionId: string;
  transcriptPath: string | null;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  cwd?: string;
  hookEventName?: string;
  model?: string;
  permissionMode?: string;
}

export interface PlatformAdapter {
  readonly platform: PlatformName;
  readonly pluginManifestDir: string;
  readonly skillDirs: string[];
  readonly envPluginRoot: string;
  readonly envPluginData: string;
  readonly envSessionId: string;
  readonly companionCommand: string;
  readonly companionFlags: (opts: SpawnOptions) => string[];
  readonly hookFile: string;
  readonly transcriptFormat: string;
  spawnCompanion(prompt: string, opts: SpawnOptions, logFd?: number): ChildProcess;
  getCompanionEnv(opts: SpawnOptions): Record<string, string>;
  resolvePluginRoot(): string;
  resolvePluginData(pluginRoot: string): string;
}

// ─── Spawner ────────────────────────────────────────────────────────

export interface SpawnOptions {
  sessionId: string;
  transcriptPath: string;
  pluginRoot: string;
  pluginData: string;
  reviewModel?: string;
  reviewMaxTurns?: number;
}

// ─── Logging ─────────────────────────────────────────────────────────

export type LogLevel = "off" | "info" | "debug";

// ─── Extended Session State ──────────────────────────────────────────

export interface SessionStateFull extends SessionState {
  start_ts?: string;
  end_ts?: string;
  review_decision?: "CREATED" | "UPDATED" | "SKIPPED" | "DELETED";
  review_detail?: string;
  skill_name?: string;
  review_duration_ms?: number;
}

// ─── Stats ───────────────────────────────────────────────────────────

export interface RecentDecision {
  ts: string;
  session_id: string;
  decision: "CREATED" | "UPDATED" | "SKIPPED" | "DELETED";
  detail: string;
  skill_name?: string;
}

export interface Stats {
  last_updated: string;
  total_sessions: number;
  total_created: number;
  total_updated: number;
  total_skipped: number;
  total_deleted: number;
  skip_reasons: Record<string, number>;
  recent_decisions: RecentDecision[];
}
