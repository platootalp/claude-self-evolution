import fs from "node:fs";
import type { TranscriptSummary, TranscriptToolCall } from "../types.js";

// totalTurns counts individual messages (both user and assistant), not conversation rounds.
// A single round (user + assistant) = totalTurns of 2.

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

  const effectiveFormat = format || "json-array";

  let entries: unknown[];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      entries = parsed;
    } else {
      entries = [parsed];
    }
  } catch {
    // JSONL: parse line-by-line with per-line error tolerance
    entries = raw
      .split("\n")
      .filter((line) => line.trim())
      .flatMap((line) => {
        try { return [JSON.parse(line)]; }
        catch { return []; } // Skip corrupted lines
      });
  }

  for (const entry of entries) {
    const e = entry as Record<string, unknown>;

    // Codex-specific: item events with command_execution
    if ((effectiveFormat === "codex-jsonl" || !format) && e.item) {
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
      // Tool results: capture as tool call output for reviewer context
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
