import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SpawnOptions, Job } from "../types.js";

export interface AgentSpawner {
  readonly platform: string;
  spawnReviewProcess(opts: SpawnOptions): Promise<Job>;
}

function generateId(): string {
  return `job-${crypto.randomUUID().slice(0, 8)}`;
}

function buildReviewPrompt(opts: SpawnOptions, pluginRoot: string): string {
  const templatePath = path.join(pluginRoot, "prompts", "review-prompt.md");
  let template: string;
  try {
    template = fs.readFileSync(templatePath, "utf-8");
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

  return template
    .replace(/\${SELF_EVOLUTION_SESSION_ID}/g, opts.sessionId)
    .replace(/\${CLAUDE_PLUGIN_ROOT}/g, opts.pluginRoot)
    .replace(/\${CLAUDE_PLUGIN_DATA}/g, opts.pluginData)
    .replace(/\${SELF_EVOLUTION_TRANSCRIPT_PATH}/g, opts.transcriptPath);
}

export class ClaudeCodeSpawner implements AgentSpawner {
  readonly platform = "claude-code";

  async spawnReviewProcess(opts: SpawnOptions): Promise<Job> {
    const prompt = buildReviewPrompt(opts, opts.pluginRoot);

    const args = [
      "-p", prompt,
      "--allowedTools", "Read,Write,Bash,Glob,Grep,Skill",
      "--max-turns", "20",
      "--output-format", "json",
    ];

    if (opts.reviewModel) {
      args.push("--model", opts.reviewModel);
    }

    const child = spawn("claude", args, {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: opts.pluginRoot,
        CLAUDE_PLUGIN_DATA: opts.pluginData,
        SELF_EVOLUTION_SESSION_ID: opts.sessionId,
        SELF_EVOLUTION_TRANSCRIPT_PATH: opts.transcriptPath,
        SELF_EVOLUTION_REVIEW_MODE: "1",
      },
    });

    child.unref();

    return {
      id: generateId(),
      session_id: opts.sessionId,
      pid: child.pid!,
      status: "running",
      started_at: new Date().toISOString(),
    };
  }
}

export class CodexSpawner implements AgentSpawner {
  readonly platform = "codex";
  async spawnReviewProcess(_opts: SpawnOptions): Promise<Job> {
    throw new Error("Codex spawner not implemented. Set platform=claude-code or implement CodexSpawner.");
  }
}

export class CursorSpawner implements AgentSpawner {
  readonly platform = "cursor";
  async spawnReviewProcess(_opts: SpawnOptions): Promise<Job> {
    throw new Error("Cursor spawner not implemented. Set platform=claude-code or implement CursorSpawner.");
  }
}

export function detectPlatform(): string {
  if (process.env.CLAUDE_PLUGIN_ROOT) return "claude-code";
  if (process.env.CODEX_SESSION_ID) return "codex";
  return "claude-code";
}

export function getSpawner(platform?: string): AgentSpawner {
  const p = platform || process.env.SELF_EVOLUTION_PLATFORM || detectPlatform();
  switch (p) {
    case "claude-code": return new ClaudeCodeSpawner();
    case "codex": return new CodexSpawner();
    case "cursor": return new CursorSpawner();
    default: return new ClaudeCodeSpawner();
  }
}
