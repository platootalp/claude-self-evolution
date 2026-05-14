import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { handlePostToolUse } from "../commands/post-tool-use.js";
import { loadState } from "../lib/state.js";

let tmpDir: string;
let statePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-ptu-test-"));
  statePath = path.join(tmpDir, "state.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("handlePostToolUse", () => {
  it("increments count for a session", () => {
    handlePostToolUse(statePath, { session_id: "s1", tool_name: "Bash", tool_input: {} }, 10);
    const state = loadState(statePath);
    expect(state.sessions["s1"].count).toBe(1);
  });

  it("sets pending_review=true when threshold reached", () => {
    for (let i = 0; i < 10; i++) {
      handlePostToolUse(statePath, { session_id: "s1", tool_name: "Bash", tool_input: {} }, 10);
    }
    const state = loadState(statePath);
    expect(state.sessions["s1"].pending_review).toBe(true);
    expect(state.sessions["s1"].count).toBe(0);
  });

  it("respects custom threshold", () => {
    handlePostToolUse(statePath, { session_id: "s1", tool_name: "Bash", tool_input: {} }, 1);
    const state = loadState(statePath);
    expect(state.sessions["s1"].pending_review).toBe(true);
  });

  it("skips when session_id is empty", () => {
    handlePostToolUse(statePath, { session_id: "", tool_name: "Bash", tool_input: {} }, 10);
    const state = loadState(statePath);
    expect(Object.keys(state.sessions)).toHaveLength(0);
  });
});
