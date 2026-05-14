import { describe, it, expect } from "vitest";
import type {
  State,
  SessionState,
  Job,
  ScanResult,
  TranscriptSummary,
  HookInput,
  PostToolUseInput,
  StopInput,
  SpawnOptions,
} from "../types.js";

describe("types", () => {
  it("State has correct shape", () => {
    const state: State = {
      sessions: {
        "abc123": { count: 7, pending_review: false },
      },
      jobs: [],
    };
    expect(state.sessions["abc123"].count).toBe(7);
  });

  it("SessionState has correct shape", () => {
    const session: SessionState = { count: 0, pending_review: false };
    expect(session.count).toBe(0);
    expect(session.pending_review).toBe(false);
  });

  it("Job has correct shape with optional fields", () => {
    const running: Job = {
      id: "job-001",
      session_id: "abc",
      pid: 12345,
      status: "running",
      started_at: "2026-05-14T10:00:00Z",
    };
    const completed: Job = {
      id: "job-002",
      session_id: "def",
      pid: 12346,
      status: "completed",
      started_at: "2026-05-14T09:00:00Z",
      completed_at: "2026-05-14T09:02:00Z",
      decision: "CREATED",
      skill_name: "debug-fastapi-5xx",
    };
    expect(running.status).toBe("running");
    expect(completed.decision).toBe("CREATED");
  });

  it("ScanResult has correct shape", () => {
    const allowed: ScanResult = { allowed: true };
    const blocked: ScanResult = { allowed: false, reason: "prompt-injection pattern" };
    expect(allowed.allowed).toBe(true);
    expect(blocked.reason).toBeDefined();
  });

  it("TranscriptSummary has correct shape", () => {
    const summary: TranscriptSummary = {
      toolCalls: [],
      userMessages: [],
      assistantMessages: [],
      totalTurns: 0,
    };
    expect(summary.totalTurns).toBe(0);
  });

  it("HookInput types have correct shape", () => {
    const postToolUse: PostToolUseInput = {
      session_id: "abc",
      tool_name: "Bash",
      tool_input: { command: "ls" },
    };
    const stop: StopInput = {
      session_id: "abc",
      transcript_path: "/path/to/transcript.jsonl",
      stop_hook_active: false,
    };
    expect(postToolUse.session_id).toBe("abc");
    expect(stop.stop_hook_active).toBe(false);
  });

  it("SpawnOptions has correct shape", () => {
    const opts: SpawnOptions = {
      sessionId: "abc",
      transcriptPath: "/path/to/transcript.jsonl",
      pluginRoot: "/path/to/plugin",
      pluginData: "/path/to/data",
    };
    expect(opts.reviewModel).toBeUndefined();
  });
});
