import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node:child_process before importing spawner
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { getSpawner, detectPlatform, ClaudeCodeSpawner, CodexSpawner, CursorSpawner } from "../lib/spawner.js";

describe("spawner", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("detectPlatform returns claude-code when CLAUDE_PLUGIN_ROOT set", () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/some/path";
    delete process.env.CODEX_SESSION_ID;
    expect(detectPlatform()).toBe("claude-code");
  });

  it("detectPlatform returns codex when CODEX_SESSION_ID set", () => {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    process.env.CODEX_SESSION_ID = "test-session";
    expect(detectPlatform()).toBe("codex");
  });

  it("detectPlatform defaults to claude-code", () => {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CODEX_SESSION_ID;
    expect(detectPlatform()).toBe("claude-code");
  });

  it("getSpawner returns ClaudeCodeSpawner by default", () => {
    const spawner = getSpawner();
    expect(spawner).toBeInstanceOf(ClaudeCodeSpawner);
  });

  it("getSpawner returns CodexSpawner for codex platform", () => {
    const spawner = getSpawner("codex");
    expect(spawner).toBeInstanceOf(CodexSpawner);
  });

  it("getSpawner returns CursorSpawner for cursor platform", () => {
    const spawner = getSpawner("cursor");
    expect(spawner).toBeInstanceOf(CursorSpawner);
  });

  it("CodexSpawner throws not implemented", async () => {
    const spawner = new CodexSpawner();
    await expect(
      spawner.spawnReviewProcess({
        sessionId: "s1",
        transcriptPath: "/tmp/transcript.jsonl",
        pluginRoot: "/tmp/plugin",
        pluginData: "/tmp/data",
      })
    ).rejects.toThrow("Codex spawner not implemented");
  });

  it("CursorSpawner throws not implemented", async () => {
    const spawner = new CursorSpawner();
    await expect(
      spawner.spawnReviewProcess({
        sessionId: "s1",
        transcriptPath: "/tmp/transcript.jsonl",
        pluginRoot: "/tmp/plugin",
        pluginData: "/tmp/data",
      })
    ).rejects.toThrow("Cursor spawner not implemented");
  });

  it("ClaudeCodeSpawner.spawnReviewProcess spawns detached process", async () => {
    const { spawn } = await import("node:child_process");
    (spawn as ReturnType<typeof import("node:child_process").spawn>).mockImplementation(() => {
      const fakeChild = {
        pid: 99999,
        unref: vi.fn(),
      } as unknown as ReturnType<typeof spawn>;
      return fakeChild as ReturnType<typeof spawn>;
    });

    const spawner = new ClaudeCodeSpawner();
    const job = await spawner.spawnReviewProcess({
      sessionId: "s1",
      transcriptPath: "/tmp/transcript.jsonl",
      pluginRoot: "/tmp/plugin",
      pluginData: "/tmp/data",
      reviewModel: "sonnet",
    });

    expect(job.status).toBe("running");
    expect(job.pid).toBe(99999);
    expect(job.session_id).toBe("s1");
    expect(spawn).toHaveBeenCalled();
    const spawnArgs = (spawn as any).mock.calls[0];
    expect(spawnArgs[0]).toBe("claude");
    expect(spawnArgs[1]).toContain("-p");
    expect(spawnArgs[1]).toContain("--model");
    expect(spawnArgs[1]).toContain("sonnet");
  });

  it("ClaudeCodeSpawner omits --model when reviewModel not set", async () => {
    const { spawn } = await import("node:child_process");
    (spawn as ReturnType<typeof import("node:child_process").spawn>).mockImplementation(() => {
      const fakeChild = {
        pid: 99998,
        unref: vi.fn(),
      } as unknown as ReturnType<typeof spawn>;
      return fakeChild as ReturnType<typeof spawn>;
    });

    const spawner = new ClaudeCodeSpawner();
    await spawner.spawnReviewProcess({
      sessionId: "s1",
      transcriptPath: "/tmp/transcript.jsonl",
      pluginRoot: "/tmp/plugin",
      pluginData: "/tmp/data",
    });

    const spawnArgs = (spawn as any).mock.calls[0];
    expect(spawnArgs[1]).not.toContain("--model");
  });

  it("getSpawner respects SELF_EVOLUTION_PLATFORM env var", () => {
    process.env.SELF_EVOLUTION_PLATFORM = "codex";
    const spawner = getSpawner();
    expect(spawner).toBeInstanceOf(CodexSpawner);
  });

  it("ClaudeCodeSpawner uses configurable max-turns", async () => {
    const { spawn } = await import("node:child_process");
    (spawn as ReturnType<typeof import("node:child_process").spawn>).mockImplementation(() => {
      const fakeChild = {
        pid: 99996,
        unref: vi.fn(),
      } as unknown as ReturnType<typeof spawn>;
      return fakeChild as ReturnType<typeof spawn>;
    });

    const spawner = new ClaudeCodeSpawner();
    await spawner.spawnReviewProcess({
      sessionId: "s1",
      transcriptPath: "/tmp/transcript.jsonl",
      pluginRoot: "/tmp/plugin",
      pluginData: "/tmp/data",
      reviewMaxTurns: 12,
    });

    const spawnArgs = (spawn as any).mock.calls[0];
    const args = spawnArgs[1] as string[];
    const maxTurnsIdx = args.indexOf("--max-turns");
    expect(maxTurnsIdx).not.toBe(-1);
    expect(args[maxTurnsIdx + 1]).toBe("12");
  });

  it("ClaudeCodeSpawner passes SELF_EVOLUTION_REVIEW_MODE in spawn env", async () => {
    const { spawn } = await import("node:child_process");
    (spawn as ReturnType<typeof import("node:child_process").spawn>).mockImplementation(() => {
      const fakeChild = {
        pid: 99997,
        unref: vi.fn(),
      } as unknown as ReturnType<typeof spawn>;
      return fakeChild as ReturnType<typeof spawn>;
    });

    const spawner = new ClaudeCodeSpawner();
    await spawner.spawnReviewProcess({
      sessionId: "s1",
      transcriptPath: "/tmp/transcript.jsonl",
      pluginRoot: "/tmp/plugin",
      pluginData: "/tmp/data",
    });

    const spawnArgs = (spawn as any).mock.calls[0];
    const env = spawnArgs[2].env;
    expect(env.SELF_EVOLUTION_REVIEW_MODE).toBe("1");
  });
});
