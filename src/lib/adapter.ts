import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import type { PlatformName, NormalizedHookInput, SpawnOptions, PlatformAdapter } from "../types.js";

export function detectPlatform(): PlatformName {
  if (process.env.CLAUDE_PLUGIN_ROOT) return "claude-code";
  if (process.env.CODEX_SESSION_ID) return "codex";
  if (process.env.CURSOR_PROJECT_DIR) return "cursor";
  // Fallback: check manifest directories
  try {
    const cwd = process.cwd();
    if (fs.existsSync(`${cwd}/.cursor-plugin/plugin.json`)) return "cursor";
    if (fs.existsSync(`${cwd}/.codex-plugin/plugin.json`)) return "codex";
    if (fs.existsSync(`${cwd}/.claude-plugin/plugin.json`)) return "claude-code";
  } catch {}
  process.stderr.write("[self-evolution] detectPlatform: no platform env vars found, defaulting to claude-code\n");
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

import { ClaudeCodeAdapter } from "./adapters/claude-code.js";
import { CodexAdapter } from "./adapters/codex.js";
import { CursorAdapter } from "./adapters/cursor.js";

export { ClaudeCodeAdapter, CodexAdapter, CursorAdapter };
export type { PlatformAdapter } from "../types.js";

export function getAdapter(platform?: PlatformName | string): PlatformAdapter {
  const p = (platform || process.env.SELF_EVOLUTION_PLATFORM || detectPlatform()) as PlatformName;
  switch (p) {
    case "codex": return new CodexAdapter();
    case "cursor": return new CursorAdapter();
    default: return new ClaudeCodeAdapter();
  }
}
