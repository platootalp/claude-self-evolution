import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { handleStopGate } from "../commands/stop-gate.js";
import { loadState, incrementCount } from "../lib/state.js";

let tmpDir: string;
let statePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evolve-sg-test-"));
  statePath = path.join(tmpDir, "state.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("handleStopGate", () => {
  it("returns allow when stop_hook_active=true", () => {
    const result = handleStopGate(statePath, {
      session_id: "s1",
      transcript_path: "/tmp/transcript.jsonl",
      stop_hook_active: true,
    }, { pluginRoot: "/tmp", pluginData: tmpDir });
    expect(result.action).toBe("allow");
    expect(result.spawned).toBe(false);
  });

  it("returns allow when no pending review", () => {
    const result = handleStopGate(statePath, {
      session_id: "s1",
      transcript_path: "/tmp/transcript.jsonl",
      stop_hook_active: false,
    }, { pluginRoot: "/tmp", pluginData: tmpDir });
    expect(result.action).toBe("allow");
    expect(result.spawned).toBe(false);
  });

  it("consumes pending and spawns companion when pending_review=true", () => {
    incrementCount(statePath, "s1", 1);
    const result = handleStopGate(statePath, {
      session_id: "s1",
      transcript_path: "/tmp/transcript.jsonl",
      stop_hook_active: false,
    }, { pluginRoot: "/tmp", pluginData: tmpDir });
    expect(result.action).toBe("allow");
    expect(result.spawned).toBe(true);
    const state = loadState(statePath);
    expect(state.sessions["s1"].pending_review).toBe(false);
  });

  it("returns allow without spawn when session_id is empty", () => {
    const result = handleStopGate(statePath, {
      session_id: "",
      transcript_path: "/tmp/transcript.jsonl",
      stop_hook_active: false,
    }, { pluginRoot: "/tmp", pluginData: tmpDir });
    expect(result.action).toBe("allow");
    expect(result.spawned).toBe(false);
  });

  it("returns allow without spawn when transcript_path is empty", () => {
    incrementCount(statePath, "s1", 1);
    const result = handleStopGate(statePath, {
      session_id: "s1",
      transcript_path: "",
      stop_hook_active: false,
    }, { pluginRoot: "/tmp", pluginData: tmpDir });
    expect(result.action).toBe("allow");
    expect(result.spawned).toBe(false);
  });
});
