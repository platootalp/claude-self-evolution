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
  decision?: "CREATED" | "UPDATED" | "SKIPPED";
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
}

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

// ─── Spawner ────────────────────────────────────────────────────────

export interface SpawnOptions {
  sessionId: string;
  transcriptPath: string;
  pluginRoot: string;
  pluginData: string;
  reviewModel?: string;
}
