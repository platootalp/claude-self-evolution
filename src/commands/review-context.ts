import fs from "node:fs";
import path from "node:path";
import { getAdapter } from "../lib/adapter.js";
import { parseTranscript } from "../lib/transcript.js";
import type { Logger } from "../lib/logger.js";

interface ReviewContextOptions {
  transcriptPath: string;
  skillsDir?: string;
  sessionId?: string;
}

interface ReviewContextResult {
  toolCalls: Array<{ tool: string; input: Record<string, unknown>; output?: string }>;
  userMessages: string[];
  assistantMessages: string[];
  totalTurns: number;
  existingSkills: string[];
}

export function handleReviewContext(options: ReviewContextOptions, logger?: Logger): ReviewContextResult {
  const adapter = getAdapter();
  const skillsDirs = options.skillsDir ? [options.skillsDir] : adapter.skillDirs;
  const transcript = parseTranscript(options.transcriptPath, adapter.transcriptFormat);

  const seen = new Set<string>();
  const existingSkills: string[] = [];
  for (const skillsDir of skillsDirs) {
    try {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (seen.has(entry.name)) continue;
        seen.add(entry.name);
        existingSkills.push(entry.name);
      }
    } catch {}
  }

  logger?.debug("context_retrieved", {
    session_id: options.sessionId ?? "unknown",
    transcript_length: transcript.toolCalls.length,
    total_turns: transcript.totalTurns,
    skills_count: existingSkills.length,
  });

  return {
    toolCalls: transcript.toolCalls,
    userMessages: transcript.userMessages,
    assistantMessages: transcript.assistantMessages,
    totalTurns: transcript.totalTurns,
    existingSkills,
  };
}
