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

  let entries: unknown[];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      entries = parsed;
    } else {
      entries = [parsed];
    }
  } catch {
    try {
      entries = raw
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    } catch {
      return summary;
    }
  }

  for (const entry of entries) {
    const e = entry as Record<string, unknown>;
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
