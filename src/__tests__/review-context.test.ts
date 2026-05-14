import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { handleReviewContext } from "../commands/review-context.js";

let tmpDir: string;
let skillsDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-rc-test-"));
  skillsDir = path.join(tmpDir, "skills");
  fs.mkdirSync(skillsDir);
  fs.mkdirSync(path.join(skillsDir, "debug-fastapi-5xx"));
  fs.mkdirSync(path.join(skillsDir, "debug-docker"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("handleReviewContext", () => {
  it("returns transcript summary and existing skills", () => {
    const transcriptPath = path.join(tmpDir, "transcript.jsonl");
    fs.writeFileSync(
      transcriptPath,
      JSON.stringify({ role: "user", content: "debug fastapi" }) + "\n" +
      JSON.stringify({ role: "tool_use", name: "Bash", input: { command: "docker ps" } }) + "\n",
      "utf-8"
    );
    const result = handleReviewContext({ transcriptPath, skillsDir });
    expect(result.toolCalls.length).toBe(1);
    expect(result.userMessages.length).toBe(1);
    expect(result.existingSkills).toContain("debug-fastapi-5xx");
    expect(result.existingSkills).toContain("debug-docker");
  });

  it("handles missing transcript gracefully", () => {
    const result = handleReviewContext({ transcriptPath: "/nonexistent/path.jsonl", skillsDir });
    expect(result.toolCalls).toHaveLength(0);
    expect(result.existingSkills).toHaveLength(2);
  });
});
