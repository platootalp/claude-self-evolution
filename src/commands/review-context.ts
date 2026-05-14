import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseTranscript } from "../lib/transcript.js";

interface ReviewContextOptions {
  transcriptPath: string;
  skillsDir?: string;
}

interface ReviewContextResult {
  toolCalls: Array<{ tool: string; input: Record<string, unknown>; output?: string }>;
  userMessages: string[];
  assistantMessages: string[];
  totalTurns: number;
  existingSkills: string[];
}

export function handleReviewContext(options: ReviewContextOptions): ReviewContextResult {
  const skillsDir = options.skillsDir ?? path.join(os.homedir(), ".claude", "skills");
  const transcript = parseTranscript(options.transcriptPath);

  let existingSkills: string[] = [];
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    existingSkills = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {}

  return {
    toolCalls: transcript.toolCalls,
    userMessages: transcript.userMessages,
    assistantMessages: transcript.assistantMessages,
    totalTurns: transcript.totalTurns,
    existingSkills,
  };
}
