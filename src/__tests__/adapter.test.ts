import { describe, it, expect, beforeEach, vi } from "vitest";

describe("detectPlatform", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns claude-code when CLAUDE_PLUGIN_ROOT is set", async () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/some/path";
    delete process.env.CODEX_SESSION_ID;
    delete process.env.CURSOR_PROJECT_DIR;
    const { detectPlatform } = await import("../lib/adapter.js");
    expect(detectPlatform()).toBe("claude-code");
  });

  it("returns codex when CODEX_SESSION_ID is set alone", async () => {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    process.env.CODEX_SESSION_ID = "session-123";
    delete process.env.CURSOR_PROJECT_DIR;
    const { detectPlatform } = await import("../lib/adapter.js");
    expect(detectPlatform()).toBe("codex");
  });

  it("returns cursor when CURSOR_PROJECT_DIR is set alone", async () => {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CODEX_SESSION_ID;
    process.env.CURSOR_PROJECT_DIR = "/project";
    const { detectPlatform } = await import("../lib/adapter.js");
    expect(detectPlatform()).toBe("cursor");
  });

  it("returns claude-code when CLAUDE_PLUGIN_ROOT is set (takes priority over CODEX_SESSION_ID)", async () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/some/path";
    process.env.CODEX_SESSION_ID = "session-123";
    delete process.env.CURSOR_PROJECT_DIR;
    const { detectPlatform } = await import("../lib/adapter.js");
    expect(detectPlatform()).toBe("claude-code");
  });

  it("returns claude-code when CLAUDE_PLUGIN_ROOT is set (takes priority over CURSOR_PROJECT_DIR)", async () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/some/path";
    delete process.env.CODEX_SESSION_ID;
    process.env.CURSOR_PROJECT_DIR = "/project";
    const { detectPlatform } = await import("../lib/adapter.js");
    expect(detectPlatform()).toBe("claude-code");
  });

  it("returns claude-code when all three env vars are set (CLAUDE_PLUGIN_ROOT takes priority)", async () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/some/path";
    process.env.CODEX_SESSION_ID = "session-123";
    process.env.CURSOR_PROJECT_DIR = "/project";
    const { detectPlatform } = await import("../lib/adapter.js");
    expect(detectPlatform()).toBe("claude-code");
  });

  it("defaults to claude-code when no platform env vars set", async () => {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CODEX_SESSION_ID;
    delete process.env.CURSOR_PROJECT_DIR;
    const spy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/no-plugin-manifests");
    const { detectPlatform } = await import("../lib/adapter.js");
    expect(detectPlatform()).toBe("claude-code");
    spy.mockRestore();
  });
});

describe("getAdapter", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns ClaudeCodeAdapter for claude-code platform", async () => {
    const { getAdapter, ClaudeCodeAdapter } = await import("../lib/adapter.js");
    const adapter = getAdapter("claude-code");
    expect(adapter).toBeInstanceOf(ClaudeCodeAdapter);
    expect(adapter.platform).toBe("claude-code");
  });

  it("returns CodexAdapter for codex platform", async () => {
    const { getAdapter, CodexAdapter } = await import("../lib/adapter.js");
    const adapter = getAdapter("codex");
    expect(adapter).toBeInstanceOf(CodexAdapter);
    expect(adapter.platform).toBe("codex");
  });

  it("returns CursorAdapter for cursor platform", async () => {
    const { getAdapter, CursorAdapter } = await import("../lib/adapter.js");
    const adapter = getAdapter("cursor");
    expect(adapter).toBeInstanceOf(CursorAdapter);
    expect(adapter.platform).toBe("cursor");
  });

  it("defaults to ClaudeCodeAdapter for unknown platform", async () => {
    const { getAdapter, ClaudeCodeAdapter } = await import("../lib/adapter.js");
    const adapter = getAdapter("unknown");
    expect(adapter).toBeInstanceOf(ClaudeCodeAdapter);
  });

  it("respects SELF_EVOLUTION_PLATFORM env var", async () => {
    process.env.SELF_EVOLUTION_PLATFORM = "codex";
    const { getAdapter, CodexAdapter } = await import("../lib/adapter.js");
    const adapter = getAdapter();
    expect(adapter).toBeInstanceOf(CodexAdapter);
    delete process.env.SELF_EVOLUTION_PLATFORM;
  });
});

describe("normalizeHookInput", () => {
  it("normalizes Claude Code hook input (snake_case fields)", async () => {
    const { normalizeHookInput } = await import("../lib/adapter.js");
    const result = normalizeHookInput({
      session_id: "s1",
      transcript_path: "/tmp/transcript.jsonl",
      tool_name: "Write",
      tool_input: { file_path: "/tmp/test.ts" },
    }, "claude-code");
    expect(result.sessionId).toBe("s1");
    expect(result.transcriptPath).toBe("/tmp/transcript.jsonl");
    expect(result.toolName).toBe("Write");
    expect(result.toolInput).toEqual({ file_path: "/tmp/test.ts" });
  });

  it("normalizes Codex hook input (adds hook_event_name, model, permission_mode)", async () => {
    const { normalizeHookInput } = await import("../lib/adapter.js");
    const result = normalizeHookInput({
      session_id: "s2",
      transcript_path: "/tmp/transcript.jsonl",
      hook_event_name: "PostToolUse",
      model: "gpt-5.4",
      permission_mode: "default",
    }, "codex");
    expect(result.sessionId).toBe("s2");
    expect(result.hookEventName).toBe("PostToolUse");
    expect(result.model).toBe("gpt-5.4");
    expect(result.permissionMode).toBe("default");
  });

  it("normalizes Cursor hook input (camelCase event names)", async () => {
    const { normalizeHookInput } = await import("../lib/adapter.js");
    const result = normalizeHookInput({
      session_id: "s3",
      transcript_path: "/tmp/transcript.jsonl",
      hook_event_name: "postToolUse",
      model: "gpt-5.2",
    }, "cursor");
    expect(result.sessionId).toBe("s3");
    expect(result.hookEventName).toBe("postToolUse");
    expect(result.model).toBe("gpt-5.2");
  });
});
