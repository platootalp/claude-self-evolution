import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseTranscript } from "../lib/transcript.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-transcript-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("parseTranscript", () => {
  it("handles empty transcript", () => {
    const emptyPath = path.join(tmpDir, "empty.jsonl");
    fs.writeFileSync(emptyPath, "", "utf-8");
    const summary = parseTranscript(emptyPath);
    expect(summary.totalTurns).toBe(0);
    expect(summary.toolCalls).toHaveLength(0);
  });

  it("handles missing file gracefully", () => {
    const summary = parseTranscript("/nonexistent/path.jsonl");
    expect(summary.totalTurns).toBe(0);
  });

  it("parses JSONL format (one JSON object per line)", () => {
    const jsonlPath = path.join(tmpDir, "test.jsonl");
    fs.writeFileSync(
      jsonlPath,
      JSON.stringify({ role: "user", content: "hello" }) + "\n" +
      JSON.stringify({ role: "assistant", content: "hi" }) + "\n",
      "utf-8"
    );
    const summary = parseTranscript(jsonlPath);
    expect(summary.userMessages).toHaveLength(1);
    expect(summary.assistantMessages).toHaveLength(1);
  });

  it("parses JSON array format", () => {
    const jsonPath = path.join(tmpDir, "test.json");
    fs.writeFileSync(
      jsonPath,
      JSON.stringify([
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ]),
      "utf-8"
    );
    const summary = parseTranscript(jsonPath);
    expect(summary.userMessages).toHaveLength(1);
    expect(summary.assistantMessages).toHaveLength(1);
  });

  it("extracts tool_use entries", () => {
    const jsonlPath = path.join(tmpDir, "tools.jsonl");
    fs.writeFileSync(
      jsonlPath,
      JSON.stringify({ role: "tool_use", name: "Bash", input: { command: "ls" } }) + "\n",
      "utf-8"
    );
    const summary = parseTranscript(jsonlPath);
    expect(summary.toolCalls).toHaveLength(1);
    expect(summary.toolCalls[0].tool).toBe("Bash");
    expect(summary.toolCalls[0].input).toEqual({ command: "ls" });
  });
});
