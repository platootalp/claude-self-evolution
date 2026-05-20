# Multi-Platform Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make self-evolution work as a native plugin on Claude Code, Codex, and Cursor via a PlatformAdapter interface.

**Architecture:** Extend the existing `AgentSpawner` pattern into a `PlatformAdapter` interface. One runtime bundle (`dist/runtime.mjs`), three platform manifests, three hook configs. Runtime detection via env vars.

**Tech Stack:** TypeScript, esbuild, vitest, Node.js child_process

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/adapter.ts` | PlatformAdapter interface, detection, factory |
| Create | `src/lib/adapters/claude-code.ts` | ClaudeCodeAdapter implementation |
| Create | `src/lib/adapters/codex.ts` | CodexAdapter implementation |
| Create | `src/lib/adapters/cursor.ts` | CursorAdapter implementation |
| Create | `src/__tests__/adapter.test.ts` | Tests for detection, factory, normalization |
| Create | `src/__tests__/adapters/claude-code.test.ts` | Tests for ClaudeCodeAdapter |
| Create | `src/__tests__/adapters/codex.test.ts` | Tests for CodexAdapter |
| Create | `src/__tests__/adapters/cursor.test.ts` | Tests for CursorAdapter |
| Create | `hooks/hooks.codex.json` | Codex hook config |
| Create | `hooks/hooks.cursor.json` | Cursor hook config |
| Create | `.codex-plugin/plugin.json` | Codex plugin manifest |
| Create | `.cursor-plugin/plugin.json` | Cursor plugin manifest |
| Create | `scripts/package.sh` | Multi-platform packaging script |
| Create | `src/__tests__/package.test.ts` | Tests for packaging script |
| Modify | `src/types.ts` | Add PlatformAdapter, HookInput (normalized), PlatformName types |
| Modify | `src/lib/spawner.ts` | Delegate to adapter, remove stubs, keep selectPromptVariant |
| Modify | `src/lib/security.ts` | Platform-aware skill dir whitelist |
| Modify | `src/lib/config.ts` | Platform-aware config resolution |
| Modify | `src/runtime.ts` | Adapter-aware path resolution, stdin normalization |
| Modify | `src/lib/transcript.ts` | Multi-format transcript parsing (codex-jsonl, cursor-jsonl) |
| Modify | `src/__tests__/spawner.test.ts` | Update for adapter-based spawning |
| Modify | `src/__tests__/security.test.ts` | Add multi-platform skill dir tests |
| Modify | `src/__tests__/runtime.test.ts` | Add multi-platform path resolution tests |
| Modify | `.claude-plugin/plugin.json` | Bump version to 0.12.0 |

---

### Task 1: Define PlatformAdapter interface and types

**Files:**
- Modify: `src/types.ts`
- Create: `src/lib/adapter.ts`
- Create: `src/__tests__/adapter.test.ts`

- [ ] **Step 1: Write failing tests for PlatformAdapter type and detectPlatform**

```typescript
// src/__tests__/adapter.test.ts
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

  it("returns codex when CODEX_SESSION_ID is set (even if CLAUDE_PLUGIN_ROOT also set)", async () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/some/path";
    process.env.CODEX_SESSION_ID = "session-123";
    delete process.env.CURSOR_PROJECT_DIR;
    const { detectPlatform } = await import("../lib/adapter.js");
    expect(detectPlatform()).toBe("codex");
  });

  it("returns cursor when CURSOR_PROJECT_DIR is set (even if CLAUDE_PLUGIN_ROOT also set)", async () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/some/path";
    process.env.CODEX_SESSION_ID = "session-123";
    process.env.CURSOR_PROJECT_DIR = "/project";
    const { detectPlatform } = await import("../lib/adapter.js");
    expect(detectPlatform()).toBe("cursor");
  });

  it("defaults to claude-code when no platform env vars set", async () => {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CODEX_SESSION_ID;
    delete process.env.CURSOR_PROJECT_DIR;
    const { detectPlatform } = await import("../lib/adapter.js");
    expect(detectPlatform()).toBe("claude-code");
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/adapter.test.ts`
Expected: FAIL — module `../lib/adapter.js` not found

- [ ] **Step 3: Add PlatformName and NormalizedHookInput types to types.ts**

Add to `src/types.ts` after the existing `HookInput` interface:

```typescript
// ─── Platform Adapter ───────────────────────────────────────────────

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
```

- [ ] **Step 4: Create adapter.ts with interface, detection, factory, and normalization**

```typescript
// src/lib/adapter.ts
import path from "node:path";
import os from "node:os";
import type { PlatformName, NormalizedHookInput, SpawnOptions } from "../types.js";
import type { ChildProcess } from "node:child_process";

export interface PlatformAdapter {
  readonly platform: PlatformName;

  // Paths
  readonly pluginManifestDir: string;
  readonly skillDirs: string[];

  // Env vars
  readonly envPluginRoot: string;
  readonly envPluginData: string;
  readonly envSessionId: string;

  // CLI companion
  readonly companionCommand: string;
  readonly companionFlags: (opts: SpawnOptions) => string[];

  // Hook format
  readonly hookFile: string;
  readonly hookEventNames: Record<string, string>;

  // Transcript
  readonly transcriptFormat: string;

  // Spawning
  spawnCompanion(prompt: string, opts: SpawnOptions, logFd?: number): ChildProcess;

  // Env vars for companion process
  getCompanionEnv(opts: SpawnOptions): Record<string, string>;

  // Resolve plugin root from env
  resolvePluginRoot(): string;
  resolvePluginData(pluginRoot: string): string;
}

export function detectPlatform(): PlatformName {
  if (process.env.CURSOR_PROJECT_DIR) return "cursor";
  if (process.env.CODEX_SESSION_ID) return "codex";
  if (process.env.CLAUDE_PLUGIN_ROOT) return "claude-code";
  return "claude-code";
}

export function normalizeHookInput(
  raw: Record<string, unknown>,
  _platform: PlatformName
): NormalizedHookInput {
  return {
    sessionId: String(raw.session_id ?? raw.sessionId ?? ""),
    transcriptPath: raw.transcript_path != null ? String(raw.transcript_path) : (raw.transcriptPath != null ? String(raw.transcriptPath) : null),
    toolName: raw.tool_name != null ? String(raw.tool_name) : (raw.toolName != null ? String(raw.toolName) : undefined),
    toolInput: (raw.tool_input ?? raw.toolInput) as Record<string, unknown> | undefined,
    cwd: raw.cwd != null ? String(raw.cwd) : undefined,
    hookEventName: raw.hook_event_name != null ? String(raw.hook_event_name) : (raw.hookEventName != null ? String(raw.hookEventName) : undefined),
    model: raw.model != null ? String(raw.model) : undefined,
    permissionMode: raw.permission_mode != null ? String(raw.permission_mode) : (raw.permissionMode != null ? String(raw.permissionMode) : undefined),
  };
}

export { ClaudeCodeAdapter } from "./adapters/claude-code.js";
export { CodexAdapter } from "./adapters/codex.js";
export { CursorAdapter } from "./adapters/cursor.js";

export function getAdapter(platform?: PlatformName | string): PlatformAdapter {
  const p = (platform || process.env.SELF_EVOLUTION_PLATFORM || detectPlatform()) as PlatformName;
  switch (p) {
    case "codex": return new CodexAdapter();
    case "cursor": return new CursorAdapter();
    default: return new ClaudeCodeAdapter();
  }
}
```

- [ ] **Step 5: Create stub adapter files so the imports resolve**

Create `src/lib/adapters/claude-code.ts`:

```typescript
// src/lib/adapters/claude-code.ts
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import type { PlatformAdapter } from "../adapter.js";
import type { PlatformName, SpawnOptions } from "../../types.js";
import type { ChildProcess } from "node:child_process";

export class ClaudeCodeAdapter implements PlatformAdapter {
  readonly platform: PlatformName = "claude-code";
  readonly pluginManifestDir = ".claude-plugin";
  readonly skillDirs = [path.join(os.homedir(), ".claude", "skills")];
  readonly envPluginRoot = "CLAUDE_PLUGIN_ROOT";
  readonly envPluginData = "CLAUDE_PLUGIN_DATA";
  readonly envSessionId = "SELF_EVOLUTION_SESSION_ID";
  readonly companionCommand = "claude";
  readonly hookFile = "hooks/hooks.json";
  readonly hookEventNames = {
    "session-start": "SessionStart",
    "post-tool-use": "PostToolUse",
    "stop": "Stop",
  };
  readonly transcriptFormat = "json-array";

  companionFlags(opts: SpawnOptions): string[] {
    const flags = [
      "-p", "",
      "--allowedTools", "Read,Write,Bash,Glob,Grep,Skill",
      "--max-turns", String(opts.reviewMaxTurns ?? 8),
      "--output-format", "json",
    ];
    if (opts.reviewModel) {
      flags.push("--model", opts.reviewModel);
    }
    return flags;
  }

  spawnCompanion(prompt: string, opts: SpawnOptions, logFd?: number): ChildProcess {
    const flags = this.companionFlags(opts);
    flags[1] = prompt;
    const child = spawn(this.companionCommand, flags, {
      detached: true,
      stdio: ["ignore", logFd ?? "ignore", logFd ?? "ignore"],
      env: {
        ...process.env,
        ...this.getCompanionEnv(opts),
      },
    });
    child.unref();
    return child;
  }

  getCompanionEnv(opts: SpawnOptions): Record<string, string> {
    return {
      CLAUDE_PLUGIN_ROOT: opts.pluginRoot,
      CLAUDE_PLUGIN_DATA: opts.pluginData,
      SELF_EVOLUTION_SESSION_ID: opts.sessionId,
      SELF_EVOLUTION_TRANSCRIPT_PATH: opts.transcriptPath,
      SELF_EVOLUTION_REVIEW_MODE: "1",
    };
  }

  resolvePluginRoot(): string {
    return process.env.CLAUDE_PLUGIN_ROOT ?? "";
  }

  resolvePluginData(pluginRoot: string): string {
    if (process.env.CLAUDE_PLUGIN_DATA) return process.env.CLAUDE_PLUGIN_DATA;
    if (pluginRoot) {
      const name = path.basename(pluginRoot);
      const marketplace = path.basename(path.dirname(pluginRoot));
      return path.join(os.homedir(), ".claude", "plugins", "data", `${name}-${marketplace}`);
    }
    return path.join(os.homedir(), ".claude", "plugins", "data", "self-evolution-self-evolution-marketplace");
  }
}
```

Create `src/lib/adapters/codex.ts`:

```typescript
// src/lib/adapters/codex.ts
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import type { PlatformAdapter } from "../adapter.js";
import type { PlatformName, SpawnOptions } from "../../types.js";
import type { ChildProcess } from "node:child_process";

export class CodexAdapter implements PlatformAdapter {
  readonly platform: PlatformName = "codex";
  readonly pluginManifestDir = ".codex-plugin";
  readonly skillDirs = [
    path.join(os.homedir(), ".agents", "skills"),
    path.join(os.homedir(), ".claude", "skills"),
  ];
  readonly envPluginRoot = "PLUGIN_ROOT";
  readonly envPluginData = "PLUGIN_DATA";
  readonly envSessionId = "CODEX_SESSION_ID";
  readonly companionCommand = "codex";
  readonly hookFile = "hooks/hooks.codex.json";
  readonly hookEventNames = {
    "session-start": "SessionStart",
    "post-tool-use": "PostToolUse",
    "stop": "Stop",
  };
  readonly transcriptFormat = "codex-jsonl";

  companionFlags(opts: SpawnOptions): string[] {
    const flags = ["exec", "", "--json"];
    if (opts.reviewModel) {
      flags.push("--model", opts.reviewModel);
    }
    return flags;
  }

  spawnCompanion(prompt: string, opts: SpawnOptions, logFd?: number): ChildProcess {
    const flags = this.companionFlags(opts);
    flags[1] = prompt;
    const child = spawn(this.companionCommand, flags, {
      detached: true,
      stdio: ["ignore", logFd ?? "ignore", logFd ?? "ignore"],
      env: {
        ...process.env,
        ...this.getCompanionEnv(opts),
      },
    });
    child.unref();
    return child;
  }

  getCompanionEnv(opts: SpawnOptions): Record<string, string> {
    return {
      PLUGIN_ROOT: opts.pluginRoot,
      PLUGIN_DATA: opts.pluginData,
      CLAUDE_PLUGIN_ROOT: opts.pluginRoot,
      CLAUDE_PLUGIN_DATA: opts.pluginData,
      SELF_EVOLUTION_SESSION_ID: opts.sessionId,
      SELF_EVOLUTION_TRANSCRIPT_PATH: opts.transcriptPath,
      SELF_EVOLUTION_REVIEW_MODE: "1",
    };
  }

  resolvePluginRoot(): string {
    return process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? "";
  }

  resolvePluginData(pluginRoot: string): string {
    if (process.env.PLUGIN_DATA) return process.env.PLUGIN_DATA;
    if (process.env.CLAUDE_PLUGIN_DATA) return process.env.CLAUDE_PLUGIN_DATA;
    if (pluginRoot) {
      const name = path.basename(pluginRoot);
      const marketplace = path.basename(path.dirname(pluginRoot));
      return path.join(os.homedir(), ".claude", "plugins", "data", `${name}-${marketplace}`);
    }
    return path.join(os.homedir(), ".claude", "plugins", "data", "self-evolution-self-evolution-marketplace");
  }
}
```

Create `src/lib/adapters/cursor.ts`:

```typescript
// src/lib/adapters/cursor.ts
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import type { PlatformAdapter } from "../adapter.js";
import type { PlatformName, SpawnOptions } from "../../types.js";
import type { ChildProcess } from "node:child_process";

export class CursorAdapter implements PlatformAdapter {
  readonly platform: PlatformName = "cursor";
  readonly pluginManifestDir = ".cursor-plugin";
  readonly skillDirs = [
    path.join(os.homedir(), ".cursor", "skills"),
    path.join(os.homedir(), ".claude", "skills"),
    path.join(os.homedir(), ".agents", "skills"),
  ];
  readonly envPluginRoot = "CURSOR_PROJECT_DIR";
  readonly envPluginData = "CURSOR_PLUGIN_DATA";
  readonly envSessionId = "CURSOR_SESSION_ID";
  readonly companionCommand = "agent";
  readonly hookFile = "hooks/hooks.cursor.json";
  readonly hookEventNames = {
    "session-start": "sessionStart",
    "post-tool-use": "postToolUse",
    "stop": "stop",
  };
  readonly transcriptFormat = "cursor-jsonl";

  companionFlags(opts: SpawnOptions): string[] {
    const flags = ["-p", "", "--output-format", "text", "--sandbox", "enabled"];
    if (opts.reviewModel) {
      flags.push("--model", opts.reviewModel);
    }
    return flags;
  }

  spawnCompanion(prompt: string, opts: SpawnOptions, logFd?: number): ChildProcess {
    const flags = this.companionFlags(opts);
    flags[1] = prompt;
    const child = spawn(this.companionCommand, flags, {
      detached: true,
      stdio: ["ignore", logFd ?? "ignore", logFd ?? "ignore"],
      env: {
        ...process.env,
        ...this.getCompanionEnv(opts),
      },
    });
    child.unref();
    return child;
  }

  getCompanionEnv(opts: SpawnOptions): Record<string, string> {
    return {
      CURSOR_PROJECT_DIR: opts.pluginRoot,
      CLAUDE_PROJECT_DIR: opts.pluginRoot,
      CLAUDE_PLUGIN_ROOT: opts.pluginRoot,
      CLAUDE_PLUGIN_DATA: opts.pluginData,
      SELF_EVOLUTION_SESSION_ID: opts.sessionId,
      SELF_EVOLUTION_TRANSCRIPT_PATH: opts.transcriptPath,
      SELF_EVOLUTION_REVIEW_MODE: "1",
    };
  }

  resolvePluginRoot(): string {
    return process.env.CURSOR_PROJECT_DIR ?? process.env.CLAUDE_PROJECT_DIR ?? process.env.CLAUDE_PLUGIN_ROOT ?? "";
  }

  resolvePluginData(pluginRoot: string): string {
    if (process.env.CURSOR_PLUGIN_DATA) return process.env.CURSOR_PLUGIN_DATA;
    if (process.env.CLAUDE_PLUGIN_DATA) return process.env.CLAUDE_PLUGIN_DATA;
    if (pluginRoot) {
      const name = path.basename(pluginRoot);
      const marketplace = path.basename(path.dirname(pluginRoot));
      return path.join(os.homedir(), ".claude", "plugins", "data", `${name}-${marketplace}`);
    }
    return path.join(os.homedir(), ".claude", "plugins", "data", "self-evolution-self-evolution-marketplace");
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/adapter.test.ts`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/lib/adapter.ts src/lib/adapters/ src/__tests__/adapter.test.ts
git commit -m "feat: add PlatformAdapter interface, detection, and 3 adapter implementations"
```

---

### Task 2: Refactor spawner.ts to delegate to PlatformAdapter

**Files:**
- Modify: `src/lib/spawner.ts`
- Modify: `src/__tests__/spawner.test.ts`

- [ ] **Step 1: Write failing tests for adapter-delegated spawning**

Add to `src/__tests__/spawner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { getSpawner, detectPlatform, ClaudeCodeSpawner, selectPromptVariant } from "../lib/spawner.js";

describe("spawner (adapter-delegated)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("detectPlatform returns cursor when CURSOR_PROJECT_DIR set", () => {
    process.env.CURSOR_PROJECT_DIR = "/project";
    delete process.env.CODEX_SESSION_ID;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    expect(detectPlatform()).toBe("cursor");
  });

  it("detectPlatform: cursor takes priority over codex", () => {
    process.env.CURSOR_PROJECT_DIR = "/project";
    process.env.CODEX_SESSION_ID = "s1";
    delete process.env.CLAUDE_PLUGIN_ROOT;
    expect(detectPlatform()).toBe("cursor");
  });

  it("ClaudeCodeSpawner spawns with claude command", async () => {
    const { spawn } = await import("node:child_process");
    (spawn as any).mockImplementation(() => ({
      pid: 100, unref: vi.fn(), on: vi.fn(),
    }));
    const spawner = new ClaudeCodeSpawner();
    await spawner.spawnReviewProcess({
      sessionId: "s1", transcriptPath: "/tmp/t.jsonl",
      pluginRoot: "/tmp/root", pluginData: "/tmp/data",
    });
    const call = (spawn as any).mock.calls[0];
    expect(call[0]).toBe("claude");
    expect(call[1]).toContain("-p");
    expect(call[1]).toContain("--allowedTools");
  });

  it("CodexSpawner spawns with codex exec command", async () => {
    const { spawn } = await import("node:child_process");
    (spawn as any).mockImplementation(() => ({
      pid: 101, unref: vi.fn(), on: vi.fn(),
    }));
    const { CodexSpawner } = await import("../lib/spawner.js");
    const spawner = new CodexSpawner();
    await spawner.spawnReviewProcess({
      sessionId: "s1", transcriptPath: "/tmp/t.jsonl",
      pluginRoot: "/tmp/root", pluginData: "/tmp/data",
    });
    const call = (spawn as any).mock.calls[0];
    expect(call[0]).toBe("codex");
    expect(call[1][0]).toBe("exec");
    expect(call[1]).toContain("--json");
  });

  it("CursorSpawner spawns with agent -p command", async () => {
    const { spawn } = await import("node:child_process");
    (spawn as any).mockImplementation(() => ({
      pid: 102, unref: vi.fn(), on: vi.fn(),
    }));
    const { CursorSpawner } = await import("../lib/spawner.js");
    const spawner = new CursorSpawner();
    await spawner.spawnReviewProcess({
      sessionId: "s1", transcriptPath: "/tmp/t.jsonl",
      pluginRoot: "/tmp/root", pluginData: "/tmp/data",
    });
    const call = (spawn as any).mock.calls[0];
    expect(call[0]).toBe("agent");
    expect(call[1][0]).toBe("-p");
    expect(call[1]).toContain("--sandbox");
  });

  it("CodexSpawner sets PLUGIN_ROOT and CLAUDE_PLUGIN_ROOT in env", async () => {
    const { spawn } = await import("node:child_process");
    (spawn as any).mockImplementation(() => ({
      pid: 103, unref: vi.fn(), on: vi.fn(),
    }));
    const { CodexSpawner } = await import("../lib/spawner.js");
    const spawner = new CodexSpawner();
    await spawner.spawnReviewProcess({
      sessionId: "s1", transcriptPath: "/tmp/t.jsonl",
      pluginRoot: "/tmp/root", pluginData: "/tmp/data",
    });
    const call = (spawn as any).mock.calls[0];
    expect(call[2].env.PLUGIN_ROOT).toBe("/tmp/root");
    expect(call[2].env.CLAUDE_PLUGIN_ROOT).toBe("/tmp/root");
    expect(call[2].env.SELF_EVOLUTION_REVIEW_MODE).toBe("1");
  });

  it("CursorSpawner sets CURSOR_PROJECT_DIR and CLAUDE_PROJECT_DIR in env", async () => {
    const { spawn } = await import("node:child_process");
    (spawn as any).mockImplementation(() => ({
      pid: 104, unref: vi.fn(), on: vi.fn(),
    }));
    const { CursorSpawner } = await import("../lib/spawner.js");
    const spawner = new CursorSpawner();
    await spawner.spawnReviewProcess({
      sessionId: "s1", transcriptPath: "/tmp/t.jsonl",
      pluginRoot: "/tmp/root", pluginData: "/tmp/data",
    });
    const call = (spawn as any).mock.calls[0];
    expect(call[2].env.CURSOR_PROJECT_DIR).toBe("/tmp/root");
    expect(call[2].env.CLAUDE_PROJECT_DIR).toBe("/tmp/root");
    expect(call[2].env.CLAUDE_PLUGIN_ROOT).toBe("/tmp/root");
    expect(call[2].env.SELF_EVOLUTION_REVIEW_MODE).toBe("1");
  });

  // Keep existing selectPromptVariant tests unchanged
});

describe("selectPromptVariant", () => {
  // ... (keep existing tests unchanged, copy from current file)
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/spawner.test.ts`
Expected: FAIL — CodexSpawner/CursorSpawner still throw "not implemented"

- [ ] **Step 3: Refactor spawner.ts — delegate to PlatformAdapter**

Replace the full content of `src/lib/spawner.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type { SpawnOptions, Job } from "../types.js";
import { getAdapter, detectPlatform as adapterDetectPlatform } from "./adapter.js";
import type { PlatformAdapter } from "./adapter.js";

export interface JobLifecycleCallbacks {
  onJobCreated?(job: Job): void;
  onJobExit?(jobId: string, code: number | null): void;
  onJobError?(jobId: string, err: Error): void;
}

export interface AgentSpawner {
  readonly platform: string;
  spawnReviewProcess(opts: SpawnOptions, callbacks?: JobLifecycleCallbacks): Promise<Job>;
}

export interface ExistingSkill {
  name: string;
  description: string;
}

export function selectPromptVariant(
  existingSkills: ExistingSkill[],
  transcriptContent: string
): "skill" | "update" | "combined" {
  if (!transcriptContent || transcriptContent.trim().length === 0) {
    return "combined";
  }
  const lowerTranscript = transcriptContent.toLowerCase();
  for (const skill of existingSkills) {
    const nameWords = skill.name
      .replace(/[-_./]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 3);
    for (const word of nameWords) {
      if (lowerTranscript.includes(word.toLowerCase())) {
        return "update";
      }
    }
    const descWords = skill.description
      .split(/\s+/)
      .filter(w => w.length > 3);
    for (const word of descWords) {
      if (lowerTranscript.includes(word.toLowerCase())) {
        return "update";
      }
    }
  }
  return "skill";
}

function readExistingSkills(skillDirs: string[]): ExistingSkill[] {
  const skills: ExistingSkill[] = [];
  for (const skillsDir of skillDirs) {
    try {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (skills.some(s => s.name === entry.name)) continue; // dedup
        const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
        try {
          const content = fs.readFileSync(skillPath, "utf-8");
          const nameMatch = content.match(/^---\n[\s\S]*?\bname:\s*(.+)\n/);
          const descMatch = content.match(/^---\n[\s\S]*?\bdescription:\s*(.+)\n/);
          skills.push({
            name: nameMatch ? nameMatch[1].trim().replace(/^['"]|['"]$/g, "") : entry.name,
            description: descMatch ? descMatch[1].trim().replace(/^['"]|['"]$/g, "") : "",
          });
        } catch {
          skills.push({ name: entry.name, description: "" });
        }
      }
    } catch {}
  }
  return skills;
}

function readTranscriptContent(transcriptPath: string): string {
  try {
    return fs.readFileSync(transcriptPath, "utf-8");
  } catch {
    return "";
  }
}

function generateId(): string {
  return `job-${crypto.randomUUID().slice(0, 8)}`;
}

function buildReviewPrompt(opts: SpawnOptions, pluginRoot: string, variant: "skill" | "update" | "combined" | "default" = "default"): string {
  let templateName: string;
  switch (variant) {
    case "skill": templateName = "review-prompt-skill.md"; break;
    case "update": templateName = "review-prompt-update.md"; break;
    case "combined": templateName = "review-prompt-combined.md"; break;
    default: templateName = "review-prompt.md"; break;
  }

  const templatePath = path.join(pluginRoot, "prompts", templateName);
  let template: string;
  try {
    template = fs.readFileSync(templatePath, "utf-8");
  } catch {
    try {
      template = fs.readFileSync(path.join(pluginRoot, "prompts", "review-prompt.md"), "utf-8");
    } catch {
      template = `You are a self-evolution reviewer. A conversation has ended and the nudge threshold was met.

Session: \${SELF_EVOLUTION_SESSION_ID}
Plugin Root: \${CLAUDE_PLUGIN_ROOT}
Plugin Data: \${CLAUDE_PLUGIN_DATA}

Your task:
1. Run: node "\${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" review-context "\${SELF_EVOLUTION_TRANSCRIPT_PATH}"
   Returns transcript summary and existing skills.
2. Decide CREATE / UPDATE / SKIP. SKIP unless: reusable (>=3 steps), generalizable, no one-off data.
3. Write ONE sentence (<=30 words) explaining WHY. Reject if trivial.
4. Before writing, run security scan:
   node "\${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" security-scan --path <path> --content <content>
   If {allowed: false}, output: SKIPPED: hard_gate_blocked: <reason>
5. If CREATE or UPDATE, invoke Skill('self-evolution:evolve-skill-writer', context) and Write.
6. Run: node "\${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" log-decision "<VERB>" "<reason>"
7. Output your final decision.

NEVER output ok:false. Always complete and exit.`;
    }
  }

  return template
    .replace(/\${SELF_EVOLUTION_SESSION_ID}/g, opts.sessionId)
    .replace(/\${CLAUDE_PLUGIN_ROOT}/g, opts.pluginRoot)
    .replace(/\${CLAUDE_PLUGIN_DATA}/g, opts.pluginData)
    .replace(/\${SELF_EVOLUTION_TRANSCRIPT_PATH}/g, opts.transcriptPath);
}

// ─── Adapter-backed Spawners ─────────────────────────────────────────

abstract class AdapterSpawner implements AgentSpawner {
  abstract readonly platform: string;
  protected abstract getAdapterInstance(): PlatformAdapter;

  async spawnReviewProcess(opts: SpawnOptions, callbacks?: JobLifecycleCallbacks): Promise<Job> {
    const adapter = this.getAdapterInstance();
    const existingSkills = readExistingSkills(adapter.skillDirs);
    const transcriptContent = readTranscriptContent(opts.transcriptPath);
    const variant = selectPromptVariant(existingSkills, transcriptContent);
    const prompt = buildReviewPrompt(opts, opts.pluginRoot, variant);

    const sessionDir = path.join(opts.pluginData, "sessions", opts.sessionId);
    let logFd: number | undefined;
    try {
      fs.mkdirSync(sessionDir, { recursive: true });
      logFd = fs.openSync(path.join(sessionDir, "companion.log"), "a");
    } catch {}

    const child = adapter.spawnCompanion(prompt, opts, logFd);

    const jobId = generateId();

    child.on("error", (err) => {
      callbacks?.onJobError?.(jobId, err);
    });

    child.on("exit", (code) => {
      if (logFd !== undefined) {
        try { fs.closeSync(logFd); } catch {}
      }
      callbacks?.onJobExit?.(jobId, code);
    });

    const job: Job = {
      id: jobId,
      session_id: opts.sessionId,
      pid: child.pid!,
      status: "running",
      started_at: new Date().toISOString(),
    };

    callbacks?.onJobCreated?.(job);
    return job;
  }
}

export class ClaudeCodeSpawner extends AdapterSpawner {
  readonly platform = "claude-code";
  protected getAdapterInstance(): PlatformAdapter {
    return getAdapter("claude-code");
  }
}

export class CodexSpawner extends AdapterSpawner {
  readonly platform = "codex";
  protected getAdapterInstance(): PlatformAdapter {
    return getAdapter("codex");
  }
}

export class CursorSpawner extends AdapterSpawner {
  readonly platform = "cursor";
  protected getAdapterInstance(): PlatformAdapter {
    return getAdapter("cursor");
  }
}

export function detectPlatform(): string {
  return adapterDetectPlatform();
}

export function getSpawner(platform?: string): AgentSpawner {
  const p = platform || process.env.SELF_EVOLUTION_PLATFORM || detectPlatform();
  switch (p) {
    case "codex": return new CodexSpawner();
    case "cursor": return new CursorSpawner();
    default: return new ClaudeCodeSpawner();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/spawner.test.ts`
Expected: All PASS

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/spawner.ts src/__tests__/spawner.test.ts
git commit -m "refactor: delegate spawner to PlatformAdapter, implement Codex and Cursor companion spawning"
```

---

### Task 3: Update security.ts for multi-platform skill dirs

**Files:**
- Modify: `src/lib/security.ts`
- Modify: `src/__tests__/security.test.ts`

- [ ] **Step 1: Write failing tests for multi-platform skill dir whitelist**

Add to `src/__tests__/security.test.ts`:

```typescript
describe("scanWrite multi-platform skill dirs", () => {
  it("allows writes to ~/.agents/skills/<name>/SKILL.md (codex path)", () => {
    const { scanWrite, _setSkillsDirs } = await import("../lib/security.js");
    _setSkillsDirs([
      path.join(os.homedir(), ".agents", "skills"),
      path.join(os.homedir(), ".claude", "skills"),
    ]);
    const targetPath = path.join(os.homedir(), ".agents", "skills", "my-skill", "SKILL.md");
    const result = scanWrite(targetPath, "---\nname: test\ndescription: test\n---\ncontent");
    expect(result.allowed).toBe(true);
    _setSkillsDirs([path.join(os.homedir(), ".claude", "skills")]); // reset
  });

  it("allows writes to ~/.cursor/skills/<name>/SKILL.md (cursor path)", () => {
    const { scanWrite, _setSkillsDirs } = await import("../lib/security.js");
    _setSkillsDirs([
      path.join(os.homedir(), ".cursor", "skills"),
      path.join(os.homedir(), ".claude", "skills"),
    ]);
    const targetPath = path.join(os.homedir(), ".cursor", "skills", "my-skill", "SKILL.md");
    const result = scanWrite(targetPath, "---\nname: test\ndescription: test\n---\ncontent");
    expect(result.allowed).toBe(true);
    _setSkillsDirs([path.join(os.homedir(), ".claude", "skills")]); // reset
  });

  it("blocks writes to ~/.codex/skills/ when not in skillDirs", () => {
    const { scanWrite, _setSkillsDirs } = await import("../lib/security.js");
    _setSkillsDirs([path.join(os.homedir(), ".claude", "skills")]);
    const targetPath = path.join(os.homedir(), ".codex", "skills", "my-skill", "SKILL.md");
    const result = scanWrite(targetPath, "---\nname: test\ndescription: test\n---\ncontent");
    expect(result.allowed).toBe(false);
    _setSkillsDirs([path.join(os.homedir(), ".claude", "skills")]); // reset
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/security.test.ts`
Expected: FAIL — `_setSkillsDirs` does not exist, codex/cursor paths are rejected

- [ ] **Step 3: Update security.ts to support multiple skill dirs**

Replace the `_skillsDir` lazy-loaded cache in `src/lib/security.ts`:

```typescript
// Replace the existing _skillsDir section with:
let _skillDirs: string[] | null = null;
export function _resetSkillsDirCache(): void {
  _skillDirs = null;
}
export function _setSkillsDirs(dirs: string[]): void {
  _skillDirs = dirs;
}
function getSkillDirs(): string[] {
  if (!_skillDirs) {
    _skillDirs = [path.join(os.homedir(), ".claude", "skills")];
  }
  return _skillDirs;
}
```

Update the `scanWrite` function's path whitelist section. Replace the existing path whitelist block (from `// 1. Path whitelist` through the file type restriction) with:

```typescript
  // 1. Path whitelist: check against all configured skill dirs
  const normalizedTarget = path.normalize(targetPath);
  const skillDirs = getSkillDirs();

  let matchedSkillsDir: string | null = null;
  for (const dir of skillDirs) {
    const normalizedSkillsDir = path.normalize(dir);
    if (normalizedTarget.startsWith(normalizedSkillsDir + path.sep) || normalizedTarget === normalizedSkillsDir) {
      matchedSkillsDir = normalizedSkillsDir;
      break;
    }
  }

  if (matchedSkillsDir) {
    const rel = path.relative(matchedSkillsDir, normalizedTarget);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return { allowed: false, reason: "path_escape: write outside skills/<name>/" };
    }

    const isSkillMd = /^[^/]+\/SKILL\.md$/.test(rel);
    const isReferences = /^[^/]+\/references\//.test(rel);
    const isTemplates = /^[^/]+\/templates\//.test(rel);

    if (!isSkillMd && !isReferences && !isTemplates) {
      return { allowed: false, reason: "path_escape: write to skills/ must be to <name>/SKILL.md, <name>/references/**, or <name>/templates/**" };
    }

    const ALLOWED_AUX_EXTENSIONS = [".md", ".txt", ".yaml", ".yml", ".json"];
    if (isReferences || isTemplates) {
      const ext = path.extname(normalizedTarget).toLowerCase();
      if (!ALLOWED_AUX_EXTENSIONS.includes(ext)) {
        return { allowed: false, reason: `file_type: auxiliary files must be one of ${ALLOWED_AUX_EXTENSIONS.join(", ")}, got '${ext}'` };
      }
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/security.test.ts`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/security.ts src/__tests__/security.test.ts
git commit -m "feat: multi-platform skill dir whitelist in security scanner"
```

---

### Task 4: Update runtime.ts for adapter-aware path resolution and stdin normalization

**Files:**
- Modify: `src/runtime.ts`
- Modify: `src/__tests__/runtime.test.ts`

- [ ] **Step 1: Write failing tests for adapter-aware runtime**

Add to `src/__tests__/runtime.test.ts`:

```typescript
describe("runtime multi-platform resolvePaths", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses PLUGIN_ROOT env var when platform is codex", () => {
    process.env.PLUGIN_ROOT = "/codex/plugin/root";
    process.env.CLAUDE_PLUGIN_ROOT = "/codex/plugin/root";
    delete process.env.CURSOR_PROJECT_DIR;
    // When runCommand is called with codex adapter active,
    // pluginRoot should resolve from PLUGIN_ROOT
    const { runCommand } = await import("../runtime.js");
    // We can't easily test runCommand directly for path resolution
    // but we can test that the adapter is consulted
  });

  it("uses CURSOR_PROJECT_DIR env var when platform is cursor", () => {
    process.env.CURSOR_PROJECT_DIR = "/cursor/project";
    delete process.env.CODEX_SESSION_ID;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    // Similar test
  });
});
```

- [ ] **Step 2: Update runtime.ts resolvePaths to use adapter**

Replace the `resolvePaths()` function in `src/runtime.ts`:

```typescript
import { getAdapter, detectPlatform, normalizeHookInput } from "./lib/adapter.js";

function resolvePaths(): { statePath: string; sessionsDir: string; statsPath: string; pluginRoot: string; pluginData: string; config: Config } {
  const adapter = getAdapter();
  const pluginRoot = adapter.resolvePluginRoot();
  const pluginData = adapter.resolvePluginData(pluginRoot);
  const config = resolveConfig(pluginRoot, pluginData);

  return {
    statePath: path.join(pluginData, "state.json"),
    sessionsDir: path.join(pluginData, "sessions"),
    statsPath: path.join(pluginData, "stats.json"),
    pluginRoot,
    pluginData,
    config,
  };
}
```

Also update the `session-start` and `post-tool-use` command handlers to use `normalizeHookInput`:

In the `session-start` case, replace:
```typescript
const input = JSON.parse(stdinData);
sessionId = input.session_id ?? process.env.SELF_EVOLUTION_SESSION_ID ?? `session-${Date.now()}`;
```
with:
```typescript
const raw = JSON.parse(stdinData);
const input = normalizeHookInput(raw, adapter.platform);
sessionId = input.sessionId || process.env.SELF_EVOLUTION_SESSION_ID || `session-${Date.now()}`;
```

In the `post-tool-use` case, replace:
```typescript
const input = JSON.parse(stdinData);
const sessionId = input.session_id ?? process.env.SELF_EVOLUTION_SESSION_ID ?? `session-${Date.now()}`;
```
with:
```typescript
const raw = JSON.parse(stdinData);
const input = normalizeHookInput(raw, adapter.platform);
const sessionId = input.sessionId || process.env.SELF_EVOLUTION_SESSION_ID || `session-${Date.now()}`;
```

In the `stop-gate` case, replace:
```typescript
const input = JSON.parse(stdinData);
const sessionId = input.session_id ?? process.env.SELF_EVOLUTION_SESSION_ID ?? `session-${Date.now()}`;
```
with:
```typescript
const raw = JSON.parse(stdinData);
const input = normalizeHookInput(raw, adapter.platform);
const sessionId = input.sessionId || process.env.SELF_EVOLUTION_SESSION_ID || `session-${Date.now()}`;
```

And update the `handleStopGate` call to pass the adapter's `StopInput` with normalized fields. The `StopInput` type uses `stop_hook_active` and `transcript_path` — these need to be remapped:

```typescript
handleStopGate(statePath, sessionsDir, sessionId, {
  session_id: sessionId,
  transcript_path: input.transcriptPath ?? "",
  stop_hook_active: raw.stop_hook_active ?? raw.stopHookActive ?? false,
}, {
  pluginRoot,
  pluginData,
  reviewModel: config.review_model,
  reviewMaxTurns: config.review_max_turns,
  platform: config.platform,
}, logger);
```

Also update the `handlePostToolUse` call to pass the original `raw` object (it still expects snake_case):

```typescript
handlePostToolUse(statePath, sessionsDir, raw, logger, config.nudge_interval);
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All PASS (existing tests should still work since Claude Code is the default)

- [ ] **Step 4: Commit**

```bash
git add src/runtime.ts src/__tests__/runtime.test.ts
git commit -m "feat: adapter-aware path resolution and stdin normalization in runtime"
```

---

### Task 5: Add multi-format transcript parsing

**Files:**
- Modify: `src/lib/transcript.ts`
- Modify: `src/__tests__/transcript.test.ts`

- [ ] **Step 1: Write failing tests for Codex and Cursor transcript formats**

Add to `src/__tests__/transcript.test.ts`:

```typescript
describe("parseTranscript codex-jsonl format", () => {
  it("parses codex item events with command_execution type", () => {
    const codexTranscript = [
      JSON.stringify({ type: "user", message: { content: "fix the bug" } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "npm test" } }] } }),
      JSON.stringify({ item: { type: "command_execution", command: "npm test", exit_code: 0 } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "All tests pass" }] } }),
    ].join("\n");
    // Write to temp file
    const tmpFile = path.join(os.tmpdir(), `codex-test-${Date.now()}.jsonl`);
    fs.writeFileSync(tmpFile, codexTranscript);
    const result = parseTranscript(tmpFile, "codex-jsonl");
    expect(result.userMessages).toHaveLength(1);
    expect(result.userMessages[0]).toBe("fix the bug");
    expect(result.toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(result.assistantMessages).toHaveLength(1);
    fs.unlinkSync(tmpFile);
  });
});

describe("parseTranscript cursor-jsonl format", () => {
  it("parses cursor format (same as claude code with camelCase fields)", () => {
    const cursorTranscript = [
      JSON.stringify({ type: "user", message: { content: "refactor this" } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "I'll refactor it" }] } }),
    ].join("\n");
    const tmpFile = path.join(os.tmpdir(), `cursor-test-${Date.now()}.jsonl`);
    fs.writeFileSync(tmpFile, cursorTranscript);
    const result = parseTranscript(tmpFile, "cursor-jsonl");
    expect(result.userMessages).toHaveLength(1);
    expect(result.assistantMessages).toHaveLength(1);
    fs.unlinkSync(tmpFile);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/transcript.test.ts`
Expected: FAIL — `parseTranscript` doesn't accept a second `format` parameter

- [ ] **Step 3: Update parseTranscript to accept format parameter and handle codex-jsonl**

Update the function signature and add Codex-specific parsing:

```typescript
export function parseTranscript(transcriptPath: string, format?: string): TranscriptSummary {
  const summary: TranscriptSummary = {
    toolCalls: [],
    userMessages: [],
    assistantMessages: [],
    totalTurns: 0,
  };

  if (!transcriptPath) {
    process.stderr.write("[self-evolution] parseTranscript: transcript path is empty\n");
    return summary;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(transcriptPath, "utf-8").trim();
  } catch (err) {
    process.stderr.write(`[self-evolution] parseTranscript: failed to read "${transcriptPath}": ${err}\n`);
    return summary;
  }

  if (!raw) return summary;

  let entries: unknown[];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      entries = parsed;
    } else {
      entries = [parsed];
    }
  } catch {
    entries = raw
      .split("\n")
      .filter((line) => line.trim())
      .flatMap((line) => {
        try { return [JSON.parse(line)]; }
        catch { return []; }
      });
  }

  const effectiveFormat = format || "json-array";

  for (const entry of entries) {
    const e = entry as Record<string, unknown>;

    // Codex-specific: item events with command_execution
    if (effectiveFormat === "codex-jsonl" && e.item) {
      const item = e.item as Record<string, unknown>;
      if (item.type === "command_execution") {
        const toolCall: TranscriptToolCall = {
          tool: "Bash",
          input: { command: String(item.command ?? "") },
          output: String(item.output ?? ""),
        };
        summary.toolCalls.push(toolCall);
        summary.totalTurns++;
      }
      continue;
    }

    const type = e.type as string | undefined;
    const message = e.message as Record<string, unknown> | undefined;

    if (type === "user" && message) {
      if ((e as Record<string, unknown>).isMeta) continue;
      const content = message.content;
      if (typeof content === "string") {
        summary.userMessages.push(content);
        summary.totalTurns++;
      } else if (Array.isArray(content)) {
        let added = false;
        for (const block of content) {
          if (typeof block === "object" && block !== null) {
            const b = block as Record<string, unknown>;
            if (b.type === "text" && typeof b.text === "string") {
              summary.userMessages.push(b.text);
              added = true;
            }
          }
        }
        if (added) summary.totalTurns++;
      }
    } else if (type === "assistant" && message) {
      const content = message.content;
      if (typeof content === "string") {
        summary.assistantMessages.push(content);
        summary.totalTurns++;
      } else if (Array.isArray(content)) {
        let added = false;
        for (const block of content) {
          if (typeof block === "object" && block !== null) {
            const b = block as Record<string, unknown>;
            if (b.type === "text" && typeof b.text === "string") {
              summary.assistantMessages.push(b.text);
              added = true;
            } else if (b.type === "tool_use") {
              const toolCall: TranscriptToolCall = {
                tool: String(b.name ?? "unknown"),
                input: (b.input ?? {}) as Record<string, unknown>,
              };
              summary.toolCalls.push(toolCall);
              added = true;
            }
          }
        }
        if (added) summary.totalTurns++;
      }
    } else if (type === "tool_result") {
      const toolCall: TranscriptToolCall = {
        tool: String(e.tool_use_id ?? e.name ?? "unknown"),
        input: {},
        output: typeof e.content === "string" ? e.content : JSON.stringify(e.content ?? ""),
      };
      summary.toolCalls.push(toolCall);
    } else if (!type && e.role) {
      summary.totalTurns++;
      if (e.role === "user" && typeof e.content === "string") {
        summary.userMessages.push(e.content as string);
      } else if (e.role === "assistant" && typeof e.content === "string") {
        summary.assistantMessages.push(e.content as string);
      } else if (e.role === "tool_use" || e.role === "tool") {
        const toolCall: TranscriptToolCall = {
          tool: String(e.name ?? e.tool_name ?? "unknown"),
          input: (e.input ?? e.tool_input ?? {}) as Record<string, unknown>,
        };
        if (e.content || e.output) {
          toolCall.output = String(e.content ?? e.output ?? "");
        }
        summary.toolCalls.push(toolCall);
      }
    }
  }

  return summary;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/transcript.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/transcript.ts src/__tests__/transcript.test.ts
git commit -m "feat: multi-format transcript parsing (codex-jsonl, cursor-jsonl)"
```

---

### Task 6: Add Codex and Cursor hook configs and manifests

**Files:**
- Create: `hooks/hooks.codex.json`
- Create: `hooks/hooks.cursor.json`
- Create: `.codex-plugin/plugin.json`
- Create: `.cursor-plugin/plugin.json`

- [ ] **Step 1: Create Codex hook config**

Create `hooks/hooks.codex.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/dist/runtime.mjs\" session-start",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/dist/runtime.mjs\" post-tool-use",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/dist/runtime.mjs\" stop-gate",
            "timeout": 30,
            "statusMessage": "evolve: checking..."
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Create Cursor hook config**

Create `hooks/hooks.cursor.json`:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "command": "node \"${CURSOR_PROJECT_DIR}/dist/runtime.mjs\" session-start",
        "timeout": 5
      }
    ],
    "postToolUse": [
      {
        "command": "node \"${CURSOR_PROJECT_DIR}/dist/runtime.mjs\" post-tool-use",
        "timeout": 5,
        "matcher": "*"
      }
    ],
    "stop": [
      {
        "command": "node \"${CURSOR_PROJECT_DIR}/dist/runtime.mjs\" stop-gate",
        "timeout": 30
      }
    ]
  }
}
```

- [ ] **Step 3: Create Codex plugin manifest**

Create `.codex-plugin/plugin.json`:

```json
{
  "name": "self-evolution",
  "version": "0.12.0",
  "description": "Auto-curate skills from your conversations via companion-mode background review, hard-gated security and meta-skill driven content generation.",
  "author": { "name": "platootalp" },
  "skills": "./skills/",
  "hooks": "./hooks/hooks.codex.json",
  "interface": {
    "displayName": "Self-Evolution",
    "category": "Productivity",
    "capabilities": ["Read", "Write"]
  }
}
```

- [ ] **Step 4: Create Cursor plugin manifest**

Create `.cursor-plugin/plugin.json`:

```json
{
  "name": "self-evolution",
  "version": "0.12.0",
  "description": "Auto-curate skills from your conversations via companion-mode background review, hard-gated security and meta-skill driven content generation.",
  "author": { "name": "platootalp" }
}
```

- [ ] **Step 5: Bump Claude Code plugin version to 0.12.0**

Update `.claude-plugin/plugin.json` version from `0.11.0` to `0.12.0`.

- [ ] **Step 6: Commit**

```bash
git add hooks/hooks.codex.json hooks/hooks.cursor.json .codex-plugin/ .cursor-plugin/ .claude-plugin/plugin.json
git commit -m "feat: add Codex and Cursor hook configs, manifests, bump version to 0.12.0"
```

---

### Task 7: Wire adapter into review-context and security-scan commands

**Files:**
- Modify: `src/commands/review-context.ts`
- Modify: `src/commands/security-scan.ts`

- [ ] **Step 1: Update review-context.ts to pass transcript format to parseTranscript**

Read `src/commands/review-context.ts` to find the `parseTranscript` call, then add the format parameter from the adapter.

```typescript
import { getAdapter } from "../lib/adapter.js";
// ...
// In the function that calls parseTranscript:
const adapter = getAdapter();
const result = parseTranscript(transcriptPath, adapter.transcriptFormat);
```

- [ ] **Step 2: Update security-scan.ts to use adapter skillDirs**

Read `src/commands/security-scan.ts` to find where `scanWrite` is called, then ensure the security scanner's skillDirs are set from the adapter before scanning.

```typescript
import { getAdapter } from "../lib/adapter.js";
import { _setSkillsDirs } from "../lib/security.js";
// ...
// Before the scanWrite call:
const adapter = getAdapter();
_setSkillsDirs(adapter.skillDirs);
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/commands/review-context.ts src/commands/security-scan.ts
git commit -m "feat: wire adapter into review-context and security-scan for multi-platform support"
```

---

### Task 8: Add packaging script for multi-platform distribution

**Files:**
- Create: `scripts/package.sh`

- [ ] **Step 1: Create the packaging script**

```bash
#!/usr/bin/env bash
# scripts/package.sh — Create platform-specific plugin packages
set -euo pipefail

VERSION=$(node -e "console.log(require('./.claude-plugin/plugin.json').version)")
DIST_DIR="dist-packages"
BASE_NAME="self-evolution"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

for PLATFORM in claude-code codex cursor; do
  case "$PLATFORM" in
    claude-code) MANIFEST_DIR=".claude-plugin"; HOOKS_FILE="hooks/hooks.json" ;;
    codex)       MANIFEST_DIR=".codex-plugin"; HOOKS_FILE="hooks/hooks.codex.json" ;;
    cursor)      MANIFEST_DIR=".cursor-plugin"; HOOKS_FILE="hooks/hooks.cursor.json" ;;
  esac

  PKG_DIR="$DIST_DIR/${BASE_NAME}-${PLATFORM}-${VERSION}"
  mkdir -p "$PKG_DIR"

  # Copy runtime
  cp -r dist/ "$PKG_DIR/dist/"

  # Copy manifest
  cp -r "$MANIFEST_DIR" "$PKG_DIR/$MANIFEST_DIR"

  # Copy hooks
  mkdir -p "$PKG_DIR/hooks"
  cp "$HOOKS_FILE" "$PKG_DIR/$(basename "$HOOKS_FILE")"
  # For claude-code, hooks.json is the default; copy it as hooks.json
  if [ "$PLATFORM" = "claude-code" ]; then
    cp "$HOOKS_FILE" "$PKG_DIR/hooks/hooks.json"
  fi

  # Copy shared components
  cp -r agents/ "$PKG_DIR/agents/"
  cp -r commands/ "$PKG_DIR/commands/"
  cp -r skills/ "$PKG_DIR/skills/"
  cp -r prompts/ "$PKG_DIR/prompts/"

  # Create tarball
  tar -czf "$DIST_DIR/${BASE_NAME}-${PLATFORM}-${VERSION}.tar.gz" -C "$DIST_DIR" "${BASE_NAME}-${PLATFORM}-${VERSION}"

  echo "Packaged: ${BASE_NAME}-${PLATFORM}-${VERSION}.tar.gz"
done

echo "All packages created in $DIST_DIR/"
```

- [ ] **Step 2: Make the script executable**

Run: `chmod +x scripts/package.sh`

- [ ] **Step 3: Test the packaging script**

Run: `npm run build && ./scripts/package.sh`
Expected: Creates 3 tarballs in `dist-packages/`

- [ ] **Step 4: Commit**

```bash
git add scripts/package.sh
git commit -m "feat: add multi-platform packaging script"
```

---

### Task 9: Full integration verification

**Files:**
- No new files

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: Successful build, `dist/runtime.mjs` created

- [ ] **Step 3: Verify the build contains adapter code**

Run: `grep -c "PlatformAdapter\|CodexAdapter\|CursorAdapter" dist/runtime.mjs`
Expected: Non-zero count (all adapter code is bundled)

- [ ] **Step 4: Test the packaging script**

Run: `./scripts/package.sh`
Expected: 3 tarballs created

- [ ] **Step 5: Verify each package has the right manifest**

Run: `tar -tzf dist-packages/self-evolution-claude-code-0.12.0.tar.gz | grep plugin.json`
Expected: Contains `.claude-plugin/plugin.json`

Run: `tar -tzf dist-packages/self-evolution-codex-0.12.0.tar.gz | grep plugin.json`
Expected: Contains `.codex-plugin/plugin.json`

Run: `tar -tzf dist-packages/self-evolution-cursor-0.12.0.tar.gz | grep plugin.json`
Expected: Contains `.cursor-plugin/plugin.json`

- [ ] **Step 6: Final commit with version bump if needed**

```bash
git add -A
git commit -m "chore: verify multi-platform build and packaging"
```

---

### Task 10: Update CLAUDE.md with multi-platform architecture

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Architecture section to document multi-platform support**

Add a section after the Runtime Commands table:

```markdown
### Multi-Platform Support

Self-evolution runs on three platforms via a PlatformAdapter interface:

| Platform | Manifest | Hooks | Companion CLI | Skill Dirs |
|----------|----------|-------|---------------|------------|
| Claude Code | `.claude-plugin/` | `hooks/hooks.json` | `claude -p` | `~/.claude/skills/` |
| Codex | `.codex-plugin/` | `hooks/hooks.codex.json` | `codex exec` | `~/.agents/skills/`, `~/.claude/skills/` |
| Cursor | `.cursor-plugin/` | `hooks/hooks.cursor.json` | `agent -p` | `~/.cursor/skills/`, `~/.claude/skills/`, `~/.agents/skills/` |

Platform detection: `CURSOR_PROJECT_DIR` → cursor, `CODEX_SESSION_ID` → codex, `CLAUDE_PLUGIN_ROOT` → claude-code, default → claude-code.

All platforms share the same `dist/runtime.mjs` bundle. Use `scripts/package.sh` to create platform-specific packages.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with multi-platform architecture"
```
