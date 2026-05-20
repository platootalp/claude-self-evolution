import fs from "node:fs";
import path from "node:path";
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
  // Uncertain/empty → combined
  if (!transcriptContent || transcriptContent.trim().length === 0) {
    return "combined";
  }

  const lowerTranscript = transcriptContent.toLowerCase();

  // Check for overlap: any skill name/description keyword appears in transcript
  for (const skill of existingSkills) {
    // Skill name words (hyphens/underscores → spaces, split, filter short words)
    const nameWords = skill.name
      .replace(/[-_./]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 3);

    for (const word of nameWords) {
      if (lowerTranscript.includes(word.toLowerCase())) {
        return "update";
      }
    }

    // Description words (split, filter short words)
    const descWords = skill.description
      .split(/\s+/)
      .filter(w => w.length > 3);

    for (const word of descWords) {
      if (lowerTranscript.includes(word.toLowerCase())) {
        return "update";
      }
    }
  }

  // No overlap → skill (creation focus)
  return "skill";
}

function readExistingSkills(skillDirs: string[]): ExistingSkill[] {
  const seen = new Set<string>();
  const skills: ExistingSkill[] = [];
  for (const skillsDir of skillDirs) {
    try {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (seen.has(entry.name)) continue;
        seen.add(entry.name);
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
    // Fallback to default prompt
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
