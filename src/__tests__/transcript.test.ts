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

  it("handles empty transcript path", () => {
    const summary = parseTranscript("");
    expect(summary.totalTurns).toBe(0);
    expect(summary.toolCalls).toHaveLength(0);
    expect(summary.userMessages).toHaveLength(0);
    expect(summary.assistantMessages).toHaveLength(0);
  });

  // ── Legacy flat format (backward compat) ──

  it("parses legacy JSONL format (flat {role, content})", () => {
    const jsonlPath = path.join(tmpDir, "legacy.jsonl");
    fs.writeFileSync(
      jsonlPath,
      JSON.stringify({ role: "user", content: "hello" }) + "\n" +
      JSON.stringify({ role: "assistant", content: "hi" }) + "\n",
      "utf-8"
    );
    const summary = parseTranscript(jsonlPath);
    expect(summary.userMessages).toHaveLength(1);
    expect(summary.assistantMessages).toHaveLength(1);
    expect(summary.userMessages[0]).toBe("hello");
    expect(summary.assistantMessages[0]).toBe("hi");
  });

  it("parses legacy JSON array format", () => {
    const jsonPath = path.join(tmpDir, "legacy.json");
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

  it("extracts legacy tool_use entries", () => {
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

  // ── Claude Code real JSONL format ──

  it("parses Claude Code JSONL with nested {type, message} structure", () => {
    const jsonlPath = path.join(tmpDir, "real.jsonl");
    const lines = [
      JSON.stringify({
        type: "user",
        isMeta: false,
        message: { role: "user", content: "Fix the login bug" },
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: "I'll investigate the login bug.",
        },
      }),
    ];
    fs.writeFileSync(jsonlPath, lines.join("\n"), "utf-8");
    const summary = parseTranscript(jsonlPath);
    expect(summary.userMessages).toHaveLength(1);
    expect(summary.userMessages[0]).toBe("Fix the login bug");
    expect(summary.assistantMessages).toHaveLength(1);
    expect(summary.assistantMessages[0]).toBe("I'll investigate the login bug.");
  });

  it("parses assistant messages with array content blocks (text + tool_use)", () => {
    const jsonlPath = path.join(tmpDir, "blocks.jsonl");
    const lines = [
      JSON.stringify({
        type: "user",
        isMeta: false,
        message: { role: "user", content: "Read the config file" },
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Let me read the config file." },
            { type: "tool_use", id: "call_1", name: "Read", input: { file_path: "/etc/config.json" } },
          ],
        },
      }),
    ];
    fs.writeFileSync(jsonlPath, lines.join("\n"), "utf-8");
    const summary = parseTranscript(jsonlPath);
    expect(summary.userMessages).toHaveLength(1);
    expect(summary.assistantMessages).toHaveLength(1);
    expect(summary.assistantMessages[0]).toBe("Let me read the config file.");
    expect(summary.toolCalls).toHaveLength(1);
    expect(summary.toolCalls[0].tool).toBe("Read");
    expect(summary.toolCalls[0].input).toEqual({ file_path: "/etc/config.json" });
  });

  it("skips isMeta user entries", () => {
    const jsonlPath = path.join(tmpDir, "meta.jsonl");
    const lines = [
      JSON.stringify({
        type: "user",
        isMeta: true,
        message: { role: "user", content: "system prompt injection" },
      }),
      JSON.stringify({
        type: "user",
        isMeta: false,
        message: { role: "user", content: "real user message" },
      }),
    ];
    fs.writeFileSync(jsonlPath, lines.join("\n"), "utf-8");
    const summary = parseTranscript(jsonlPath);
    expect(summary.userMessages).toHaveLength(1);
    expect(summary.userMessages[0]).toBe("real user message");
  });

  it("skips non-user/assistant types (system, attachment, etc.)", () => {
    const jsonlPath = path.join(tmpDir, "noise.jsonl");
    const lines = [
      JSON.stringify({ type: "system", subtype: "local_command", content: "output" }),
      JSON.stringify({ type: "attachment", attachment: { type: "hook_success" } }),
      JSON.stringify({ type: "file-history-snapshot", snapshot: {} }),
      JSON.stringify({
        type: "user",
        isMeta: false,
        message: { role: "user", content: "real message" },
      }),
    ];
    fs.writeFileSync(jsonlPath, lines.join("\n"), "utf-8");
    const summary = parseTranscript(jsonlPath);
    expect(summary.userMessages).toHaveLength(1);
    expect(summary.totalTurns).toBe(1);
  });

  it("parses user messages with array content (text blocks)", () => {
    const jsonlPath = path.join(tmpDir, "user-blocks.jsonl");
    const lines = [
      JSON.stringify({
        type: "user",
        isMeta: false,
        message: {
          role: "user",
          content: [
            { type: "text", text: "Please check the logs" },
          ],
        },
      }),
    ];
    fs.writeFileSync(jsonlPath, lines.join("\n"), "utf-8");
    const summary = parseTranscript(jsonlPath);
    expect(summary.userMessages).toHaveLength(1);
    expect(summary.userMessages[0]).toBe("Please check the logs");
  });

  it("handles mixed legacy and Claude Code format entries", () => {
    const jsonlPath = path.join(tmpDir, "mixed.jsonl");
    const lines = [
      JSON.stringify({ role: "user", content: "legacy message" }),
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "modern reply" }],
        },
      }),
    ];
    fs.writeFileSync(jsonlPath, lines.join("\n"), "utf-8");
    const summary = parseTranscript(jsonlPath);
    expect(summary.userMessages).toHaveLength(1);
    expect(summary.assistantMessages).toHaveLength(1);
    expect(summary.userMessages[0]).toBe("legacy message");
    expect(summary.assistantMessages[0]).toBe("modern reply");
  });

  it("skips corrupted JSONL lines without losing other entries", () => {
    const jsonlPath = path.join(tmpDir, "corrupted.jsonl");
    const lines = [
      JSON.stringify({ role: "user", content: "good line 1" }),
      "{ this is broken json",
      JSON.stringify({ role: "assistant", content: "good line 2" }),
      "another bad line",
    ];
    fs.writeFileSync(jsonlPath, lines.join("\n"), "utf-8");
    const summary = parseTranscript(jsonlPath);
    expect(summary.userMessages).toHaveLength(1);
    expect(summary.assistantMessages).toHaveLength(1);
    expect(summary.userMessages[0]).toBe("good line 1");
    expect(summary.assistantMessages[0]).toBe("good line 2");
  });

  it("extracts tool_result entries with output", () => {
    const jsonlPath = path.join(tmpDir, "tool-result.jsonl");
    const lines = [
      JSON.stringify({
        type: "tool_result",
        tool_use_id: "call_1",
        content: "file contents here",
      }),
    ];
    fs.writeFileSync(jsonlPath, lines.join("\n"), "utf-8");
    const summary = parseTranscript(jsonlPath);
    expect(summary.toolCalls).toHaveLength(1);
    expect(summary.toolCalls[0].tool).toBe("call_1");
    expect(summary.toolCalls[0].output).toBe("file contents here");
  });
});

describe("parseTranscript codex-jsonl format", () => {
  it("parses codex item events with command_execution type", () => {
    const codexTranscript = [
      JSON.stringify({ type: "user", message: { content: "fix the bug" } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "npm test" } }] } }),
      JSON.stringify({ item: { type: "command_execution", command: "npm test", exit_code: 0, output: "all tests pass" } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "All tests pass" }] } }),
    ].join("\n");
    const tmpFile = path.join(os.tmpdir(), `codex-test-${Date.now()}.jsonl`);
    fs.writeFileSync(tmpFile, codexTranscript);
    const result = parseTranscript(tmpFile, "codex-jsonl");
    expect(result.userMessages).toHaveLength(1);
    expect(result.userMessages[0]).toBe("fix the bug");
    // Should have Bash tool_use from assistant + command_execution item
    expect(result.toolCalls.length).toBeGreaterThanOrEqual(2);
    expect(result.toolCalls.some(tc => tc.tool === "Bash" && tc.input.command === "npm test")).toBe(true);
    expect(result.toolCalls.some(tc => tc.tool === "Bash" && tc.output === "all tests pass")).toBe(true);
    expect(result.assistantMessages).toHaveLength(1);
    fs.unlinkSync(tmpFile);
  });
});

describe("parseTranscript cursor-jsonl format", () => {
  it("parses cursor format using claude-code parser as fallback", () => {
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
