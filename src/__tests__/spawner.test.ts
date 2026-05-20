import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Mock node:child_process before importing spawner
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { getSpawner, detectPlatform, ClaudeCodeSpawner, CodexSpawner, CursorSpawner, selectPromptVariant } from "../lib/spawner.js";

describe("spawner", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("detectPlatform returns claude-code when CLAUDE_PLUGIN_ROOT set", () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/some/path";
    delete process.env.CODEX_SESSION_ID;
    delete process.env.CURSOR_PROJECT_DIR;
    expect(detectPlatform()).toBe("claude-code");
  });

  it("detectPlatform returns codex when CODEX_SESSION_ID set", () => {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CURSOR_PROJECT_DIR;
    process.env.CODEX_SESSION_ID = "test-session";
    expect(detectPlatform()).toBe("codex");
  });

  it("detectPlatform returns cursor when CURSOR_PROJECT_DIR set", () => {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CODEX_SESSION_ID;
    process.env.CURSOR_PROJECT_DIR = "/some/path";
    expect(detectPlatform()).toBe("cursor");
  });

  it("detectPlatform defaults to claude-code", () => {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CODEX_SESSION_ID;
    delete process.env.CURSOR_PROJECT_DIR;
    const spy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/no-plugin-manifests");
    expect(detectPlatform()).toBe("claude-code");
    spy.mockRestore();
  });

  it("getSpawner returns ClaudeCodeSpawner by default", () => {
    const spy = vi.spyOn(process, "cwd").mockReturnValue("/tmp/no-plugin-manifests");
    const spawner = getSpawner();
    expect(spawner).toBeInstanceOf(ClaudeCodeSpawner);
    spy.mockRestore();
  });

  it("getSpawner returns CodexSpawner for codex platform", () => {
    const spawner = getSpawner("codex");
    expect(spawner).toBeInstanceOf(CodexSpawner);
  });

  it("getSpawner returns CursorSpawner for cursor platform", () => {
    const spawner = getSpawner("cursor");
    expect(spawner).toBeInstanceOf(CursorSpawner);
  });

  it("CodexSpawner spawns detached process with codex exec", async () => {
    const { spawn } = await import("node:child_process");
    (spawn as ReturnType<typeof import("node:child_process").spawn>).mockImplementation(() => {
      const fakeChild = {
        pid: 88888,
        unref: vi.fn(),
        on: vi.fn(),
      } as unknown as ReturnType<typeof spawn>;
      return fakeChild as ReturnType<typeof spawn>;
    });

    const spawner = new CodexSpawner();
    const job = await spawner.spawnReviewProcess({
      sessionId: "s1",
      transcriptPath: "/tmp/transcript.jsonl",
      pluginRoot: "/tmp/plugin",
      pluginData: "/tmp/data",
    });

    expect(job.status).toBe("running");
    expect(job.pid).toBe(88888);
    expect(spawn).toHaveBeenCalled();
    const spawnArgs = (spawn as any).mock.calls[0];
    expect(spawnArgs[0]).toBe("codex");
    expect(spawnArgs[1]).toContain("exec");
    expect(spawnArgs[1]).toContain("--json");
  });

  it("CursorSpawner spawns detached process with agent -p", async () => {
    const { spawn } = await import("node:child_process");
    (spawn as ReturnType<typeof import("node:child_process").spawn>).mockImplementation(() => {
      const fakeChild = {
        pid: 77777,
        unref: vi.fn(),
        on: vi.fn(),
      } as unknown as ReturnType<typeof spawn>;
      return fakeChild as ReturnType<typeof spawn>;
    });

    const spawner = new CursorSpawner();
    const job = await spawner.spawnReviewProcess({
      sessionId: "s1",
      transcriptPath: "/tmp/transcript.jsonl",
      pluginRoot: "/tmp/plugin",
      pluginData: "/tmp/data",
    });

    expect(job.status).toBe("running");
    expect(job.pid).toBe(77777);
    expect(spawn).toHaveBeenCalled();
    const spawnArgs = (spawn as any).mock.calls[0];
    expect(spawnArgs[0]).toBe("agent");
    expect(spawnArgs[1]).toContain("-p");
    expect(spawnArgs[1]).toContain("--sandbox");
    expect(spawnArgs[1]).toContain("enabled");
  });

  it("CodexSpawner sets PLUGIN_ROOT and CLAUDE_PLUGIN_ROOT env vars", async () => {
    const { spawn } = await import("node:child_process");
    (spawn as ReturnType<typeof import("node:child_process").spawn>).mockImplementation(() => {
      const fakeChild = {
        pid: 88887,
        unref: vi.fn(),
        on: vi.fn(),
      } as unknown as ReturnType<typeof spawn>;
      return fakeChild as ReturnType<typeof spawn>;
    });

    const spawner = new CodexSpawner();
    await spawner.spawnReviewProcess({
      sessionId: "s1",
      transcriptPath: "/tmp/transcript.jsonl",
      pluginRoot: "/tmp/plugin",
      pluginData: "/tmp/data",
    });

    const spawnArgs = (spawn as any).mock.calls[0];
    const env = spawnArgs[2].env;
    expect(env.PLUGIN_ROOT).toBe("/tmp/plugin");
    expect(env.CLAUDE_PLUGIN_ROOT).toBe("/tmp/plugin");
  });

  it("CursorSpawner sets CURSOR_PROJECT_DIR, CLAUDE_PROJECT_DIR, and CLAUDE_PLUGIN_ROOT env vars", async () => {
    const { spawn } = await import("node:child_process");
    (spawn as ReturnType<typeof import("node:child_process").spawn>).mockImplementation(() => {
      const fakeChild = {
        pid: 77776,
        unref: vi.fn(),
        on: vi.fn(),
      } as unknown as ReturnType<typeof spawn>;
      return fakeChild as ReturnType<typeof spawn>;
    });

    const spawner = new CursorSpawner();
    await spawner.spawnReviewProcess({
      sessionId: "s1",
      transcriptPath: "/tmp/transcript.jsonl",
      pluginRoot: "/tmp/plugin",
      pluginData: "/tmp/data",
    });

    const spawnArgs = (spawn as any).mock.calls[0];
    const env = spawnArgs[2].env;
    expect(env.CURSOR_PROJECT_DIR).toBe("/tmp/plugin");
    expect(env.CLAUDE_PROJECT_DIR).toBe("/tmp/plugin");
    expect(env.CLAUDE_PLUGIN_ROOT).toBe("/tmp/plugin");
  });

  it("ClaudeCodeSpawner.spawnReviewProcess spawns detached process", async () => {
    const { spawn } = await import("node:child_process");
    (spawn as ReturnType<typeof import("node:child_process").spawn>).mockImplementation(() => {
      const fakeChild = {
        pid: 99999,
        unref: vi.fn(),
        on: vi.fn(),
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
        on: vi.fn(),
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
    // Verify default --max-turns 8 when reviewMaxTurns not provided
    const args = spawnArgs[1] as string[];
    const maxTurnsIdx = args.indexOf("--max-turns");
    expect(maxTurnsIdx).not.toBe(-1);
    expect(args[maxTurnsIdx + 1]).toBe("8");
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
        on: vi.fn(),
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
        on: vi.fn(),
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

describe("selectPromptVariant", () => {
  it("returns 'skill' when no existing skills and transcript has content", () => {
    const result = selectPromptVariant([], "user asked about react hooks");
    expect(result).toBe("skill");
  });

  it("returns 'update' when existing skill name overlaps with transcript", () => {
    const result = selectPromptVariant(
      [{ name: "react-hooks", description: "React hooks patterns" }],
      "user asked about react hooks usage"
    );
    expect(result).toBe("update");
  });

  it("returns 'combined' when transcript is empty", () => {
    const result = selectPromptVariant([], "");
    expect(result).toBe("combined");
  });

  it("returns 'combined' when transcript is whitespace only", () => {
    const result = selectPromptVariant([], "   \n\t  ");
    expect(result).toBe("combined");
  });

  it("returns 'skill' when no skill name words match transcript", () => {
    const result = selectPromptVariant(
      [{ name: "docker-debug", description: "Docker debugging patterns" }],
      "user asked about react hooks"
    );
    expect(result).toBe("skill");
  });

  it("returns 'update' when skill description word matches transcript", () => {
    const result = selectPromptVariant(
      [{ name: "my-skill", description: "React component testing patterns" }],
      "user was testing components"
    );
    expect(result).toBe("update");
  });

  it("ignores short words (<=3 chars) in skill name", () => {
    const result = selectPromptVariant(
      [{ name: "api-v2", description: "" }],
      "user asked about api"  // "api" is 3 chars, should be ignored in name matching
    );
    expect(result).toBe("skill");
  });
});

describe("prompt variant files", () => {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? "";
  const promptsDir = pluginRoot ? path.join(pluginRoot, "prompts") : path.join(process.cwd(), "prompts");

  it("review-prompt-skill.md exists", () => {
    expect(fs.existsSync(path.join(promptsDir, "review-prompt-skill.md"))).toBe(true);
  });

  it("review-prompt-update.md exists", () => {
    expect(fs.existsSync(path.join(promptsDir, "review-prompt-update.md"))).toBe(true);
  });

  it("review-prompt-combined.md exists", () => {
    expect(fs.existsSync(path.join(promptsDir, "review-prompt-combined.md"))).toBe(true);
  });
});
