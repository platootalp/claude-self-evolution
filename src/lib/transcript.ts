import fs from "node:fs";
import type { TranscriptSummary, TranscriptToolCall } from "../types.js";

export function parseTranscript(transcriptPath: string): TranscriptSummary {
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

  let messages: unknown[];

  // Try JSON array first
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      messages = parsed;
    } else {
      // Single object - treat as one-item array
      messages = [parsed];
    }
  } catch {
    // Try JSONL (one JSON per line)
    try {
      messages = raw
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    } catch {
      return summary;
    }
  }

  for (const msg of messages) {
    const m = msg as Record<string, unknown>;
    summary.totalTurns++;

    if (m.role === "user" && typeof m.content === "string") {
      summary.userMessages.push(m.content);
    } else if (m.role === "assistant" && typeof m.content === "string") {
      summary.assistantMessages.push(m.content);
    } else if (m.role === "tool_use" || m.role === "tool") {
      const toolCall: TranscriptToolCall = {
        tool: String(m.name ?? m.tool_name ?? "unknown"),
        input: (m.input ?? m.tool_input ?? {}) as Record<string, unknown>,
      };
      if (m.content || m.output) {
        toolCall.output = String(m.content ?? m.output ?? "");
      }
      summary.toolCalls.push(toolCall);
    }
  }

  return summary;
}
