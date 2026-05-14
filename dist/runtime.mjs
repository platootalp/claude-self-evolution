// self-evolution runtime — auto-generated bundle


// src/runtime.ts
import path6 from "node:path";
import os3 from "node:os";

// src/lib/logger.ts
import fs from "node:fs";
import path from "node:path";
function appendLine(logPath, line) {
  try {
    const dir = path.dirname(logPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(logPath, line + "\n", "utf-8");
  } catch {
  }
}
function logEvent(logPath, level, event, kv = {}) {
  const entry = {
    ts: (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z"),
    level,
    event,
    pid: process.pid,
    ...kv
  };
  appendLine(logPath, JSON.stringify(entry));
}
function logDecision(logPath, decision, detail, durationMs, sessionId) {
  const entry = {
    ts: (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z"),
    level: "info",
    event: "reviewer_decision",
    decision,
    detail,
    duration_ms: durationMs,
    session_id: sessionId,
    pid: process.pid
  };
  appendLine(logPath, JSON.stringify(entry));
}

// src/commands/session-start.ts
function handleSessionStart(logPath, env) {
  logEvent(logPath, "info", "diag_hook_fired", {
    CLAUDE_PLUGIN_ROOT: env.CLAUDE_PLUGIN_ROOT ?? "EMPTY",
    CLAUDE_PLUGIN_DATA: env.CLAUDE_PLUGIN_DATA ?? "EMPTY"
  });
}

// src/lib/state.ts
import fs2 from "node:fs";
import path2 from "node:path";
function loadState(statePath) {
  try {
    const raw = fs2.readFileSync(statePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { sessions: {}, jobs: [] };
  }
}
function saveState(statePath, state) {
  const dir = path2.dirname(statePath);
  fs2.mkdirSync(dir, { recursive: true });
  const tmpPath = statePath + ".tmp";
  fs2.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  fs2.renameSync(tmpPath, statePath);
}
function incrementCount(statePath, sessionId, threshold = 10) {
  const state = loadState(statePath);
  if (!state.sessions[sessionId]) {
    state.sessions[sessionId] = { count: 0, pending_review: false };
  }
  const newCount = state.sessions[sessionId].count + 1;
  if (newCount >= threshold) {
    state.sessions[sessionId].count = 0;
    state.sessions[sessionId].pending_review = true;
  } else {
    state.sessions[sessionId].count = newCount;
  }
  saveState(statePath, state);
  return state.sessions[sessionId].count;
}
function consumePending(statePath, sessionId) {
  const state = loadState(statePath);
  if (!state.sessions[sessionId]) {
    return false;
  }
  if (state.sessions[sessionId].pending_review) {
    state.sessions[sessionId].pending_review = false;
    saveState(statePath, state);
    return true;
  }
  return false;
}
function addJob(statePath, job) {
  const state = loadState(statePath);
  state.jobs.push(job);
  saveState(statePath, state);
}

// src/commands/post-tool-use.ts
function handlePostToolUse(statePath, input, threshold = 10) {
  if (!input.session_id) return;
  incrementCount(statePath, input.session_id, threshold);
}

// src/lib/spawner.ts
import { spawn } from "node:child_process";
import fs3 from "node:fs";
import path3 from "node:path";
import crypto from "node:crypto";
function generateId() {
  return `job-${crypto.randomUUID().slice(0, 8)}`;
}
function buildReviewPrompt(opts, pluginRoot) {
  const templatePath = path3.join(pluginRoot, "prompts", "review-prompt.md");
  let template;
  try {
    template = fs3.readFileSync(templatePath, "utf-8");
  } catch {
    template = `You are a self-evolution reviewer. A conversation has ended and the nudge threshold was met.

Session: \${SELF_EVOLUTION_SESSION_ID}
Plugin Root: \${CLAUDE_PLUGIN_ROOT}
Plugin Data: \${CLAUDE_PLUGIN_DATA}

Your task:
1. Run: node "\${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" review-context
   Returns transcript summary and existing skills.
2. Decide CREATE / UPDATE / SKIP. SKIP unless: reusable (>=3 steps), generalizable, no one-off data.
3. Write ONE sentence (<=30 words) explaining WHY. Reject if trivial.
4. Before writing, run security scan:
   node "\${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" security-scan --path <path> --content <content>
   If {allowed: false}, output: SKIPPED: hard_gate_blocked: <reason>
5. If CREATE or UPDATE, invoke Skill('self-evolution:evolve-skill-writer', context) and Write.
6. Run: node "\${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" log-decision "<VERB>" "<reason>"
7. Output your final decision.

NEVER output ok:false. Always complete and exit.`;
  }
  return template.replace(/\${SELF_EVOLUTION_SESSION_ID}/g, opts.sessionId).replace(/\${CLAUDE_PLUGIN_ROOT}/g, opts.pluginRoot).replace(/\${CLAUDE_PLUGIN_DATA}/g, opts.pluginData);
}
var ClaudeCodeSpawner = class {
  platform = "claude-code";
  async spawnReviewProcess(opts) {
    const prompt = buildReviewPrompt(opts, opts.pluginRoot);
    const args = [
      "-p",
      prompt,
      "--allowedTools",
      "Read,Write,Bash,Glob,Grep,Skill",
      "--max-turns",
      "20",
      "--output-format",
      "json"
    ];
    if (opts.reviewModel) {
      args.push("--model", opts.reviewModel);
    }
    const child = spawn("claude", args, {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: opts.pluginRoot,
        CLAUDE_PLUGIN_DATA: opts.pluginData,
        SELF_EVOLUTION_SESSION_ID: opts.sessionId
      }
    });
    child.unref();
    return {
      id: generateId(),
      session_id: opts.sessionId,
      pid: child.pid,
      status: "running",
      started_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
};
var CodexSpawner = class {
  platform = "codex";
  async spawnReviewProcess(_opts) {
    throw new Error("Codex spawner not implemented. Set platform=claude-code or implement CodexSpawner.");
  }
};
var CursorSpawner = class {
  platform = "cursor";
  async spawnReviewProcess(_opts) {
    throw new Error("Cursor spawner not implemented. Set platform=claude-code or implement CursorSpawner.");
  }
};
function detectPlatform() {
  if (process.env.CLAUDE_PLUGIN_ROOT) return "claude-code";
  if (process.env.CODEX_SESSION_ID) return "codex";
  return "claude-code";
}
function getSpawner(platform) {
  const p = platform || process.env.SELF_EVOLUTION_PLATFORM || detectPlatform();
  switch (p) {
    case "claude-code":
      return new ClaudeCodeSpawner();
    case "codex":
      return new CodexSpawner();
    case "cursor":
      return new CursorSpawner();
    default:
      return new ClaudeCodeSpawner();
  }
}

// src/commands/stop-gate.ts
function handleStopGate(statePath, input, options) {
  if (input.stop_hook_active) {
    return { action: "allow", spawned: false };
  }
  if (!input.session_id || !input.transcript_path) {
    return { action: "allow", spawned: false };
  }
  const hasPending = consumePending(statePath, input.session_id);
  if (!hasPending) {
    return { action: "allow", spawned: false };
  }
  try {
    const spawner = getSpawner(options.platform);
    const jobPromise = spawner.spawnReviewProcess({
      sessionId: input.session_id,
      transcriptPath: input.transcript_path,
      pluginRoot: options.pluginRoot,
      pluginData: options.pluginData,
      reviewModel: options.reviewModel
    });
    jobPromise.then((job) => {
      addJob(statePath, job);
    }).catch(() => {
    });
    return { action: "allow", spawned: true, jobId: "pending" };
  } catch {
    return { action: "allow", spawned: false };
  }
}

// src/lib/security.ts
import path4 from "node:path";
import os from "node:os";
var SKILLS_DIR = path4.join(os.homedir(), ".claude", "skills");
var PI_PATTERN = /(?:ignore previous|disregard above|<\||system:.*you are now|dump.*database|forget.*instructions)/i;
var BASH_PATTERN = /rm -rf \/(?: |$)|curl[^|]*\| *(?:ba)?sh|eval\s+\$\(|wget[^|]*-O\s*-/;
var SECRET_PATTERN = /(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----|ghp_[A-Za-z0-9]{36})/;
function scanWrite(targetPath, content, options = {}) {
  const maxSkillSize = options.maxSkillSize ?? 15360;
  const normalizedTarget = path4.normalize(targetPath);
  const normalizedSkillsDir = path4.normalize(SKILLS_DIR);
  const normalizedClaudeDir = path4.normalize(path4.join(os.homedir(), ".claude"));
  if (normalizedTarget.startsWith(normalizedClaudeDir + path4.sep) || normalizedTarget === normalizedClaudeDir) {
    const rel = path4.relative(normalizedSkillsDir, normalizedTarget);
    if (rel.startsWith("..") || path4.isAbsolute(rel)) {
      return { allowed: false, reason: "path_escape: write to ~/.claude/ outside skills/<name>/SKILL.md" };
    }
    if (!/^[^/]+\/SKILL\.md$/.test(rel)) {
      return { allowed: false, reason: "path_escape: write to ~/.claude/skills/ must be to <name>/SKILL.md" };
    }
  }
  if (PI_PATTERN.test(content)) {
    return { allowed: false, reason: "prompt-injection pattern" };
  }
  if (BASH_PATTERN.test(content)) {
    return { allowed: false, reason: "dangerous bash pattern" };
  }
  if (SECRET_PATTERN.test(content)) {
    return { allowed: false, reason: "secret leak pattern" };
  }
  const base64Pattern = /[A-Za-z0-9+/]{20,}={0,2}/g;
  const MAX_TOKENS = 50;
  let tokenCount = 0;
  let match;
  while ((match = base64Pattern.exec(content)) !== null && tokenCount < MAX_TOKENS) {
    tokenCount++;
    try {
      const decoded = Buffer.from(match[0], "base64").toString("utf-8");
      if (decoded.length < 4) continue;
      const printable = decoded.replace(/[^\x20-\x7E\t\n]/g, "").length;
      if (printable * 100 < decoded.length * 80) continue;
      if (PI_PATTERN.test(decoded)) {
        return { allowed: false, reason: "prompt-injection pattern (base64-decoded)" };
      }
      if (BASH_PATTERN.test(decoded)) {
        return { allowed: false, reason: "dangerous bash pattern (base64-decoded)" };
      }
      if (SECRET_PATTERN.test(decoded)) {
        return { allowed: false, reason: "secret leak pattern (base64-decoded)" };
      }
    } catch {
    }
  }
  const size = Buffer.byteLength(content, "utf-8");
  if (size > maxSkillSize) {
    return { allowed: false, reason: `file too large (${size} > ${maxSkillSize} bytes)` };
  }
  return { allowed: true };
}

// src/commands/security-scan.ts
function handleSecurityScan(args) {
  return scanWrite(args.path, args.content, {
    maxSkillSize: args.maxSkillSize
  });
}
function parseSecurityScanArgs(argv) {
  const args = { path: "", content: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--path" && argv[i + 1]) {
      args.path = argv[++i];
    } else if (argv[i] === "--content" && argv[i + 1]) {
      args.content = argv[++i];
    } else if (argv[i] === "--max-size" && argv[i + 1]) {
      args.maxSkillSize = parseInt(argv[++i], 10);
    }
  }
  return args;
}

// src/commands/review-context.ts
import fs5 from "node:fs";
import path5 from "node:path";
import os2 from "node:os";

// src/lib/transcript.ts
import fs4 from "node:fs";
function parseTranscript(transcriptPath) {
  const summary = {
    toolCalls: [],
    userMessages: [],
    assistantMessages: [],
    totalTurns: 0
  };
  let raw;
  try {
    raw = fs4.readFileSync(transcriptPath, "utf-8").trim();
  } catch {
    return summary;
  }
  if (!raw) return summary;
  let messages;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      messages = parsed;
    } else {
      messages = [parsed];
    }
  } catch {
    try {
      messages = raw.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
    } catch {
      return summary;
    }
  }
  for (const msg of messages) {
    const m = msg;
    summary.totalTurns++;
    if (m.role === "user" && typeof m.content === "string") {
      summary.userMessages.push(m.content);
    } else if (m.role === "assistant" && typeof m.content === "string") {
      summary.assistantMessages.push(m.content);
    } else if (m.role === "tool_use" || m.role === "tool") {
      const toolCall = {
        tool: String(m.name ?? m.tool_name ?? "unknown"),
        input: m.input ?? m.tool_input ?? {}
      };
      if (m.content || m.output) {
        toolCall.output = String(m.content ?? m.output ?? "");
      }
      summary.toolCalls.push(toolCall);
    }
  }
  return summary;
}

// src/commands/review-context.ts
function handleReviewContext(options) {
  const skillsDir = options.skillsDir ?? path5.join(os2.homedir(), ".claude", "skills");
  const transcript = parseTranscript(options.transcriptPath);
  let existingSkills = [];
  try {
    const entries = fs5.readdirSync(skillsDir, { withFileTypes: true });
    existingSkills = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
  }
  return {
    toolCalls: transcript.toolCalls,
    userMessages: transcript.userMessages,
    assistantMessages: transcript.assistantMessages,
    totalTurns: transcript.totalTurns,
    existingSkills
  };
}

// src/commands/log-decision.ts
function handleLogDecision(logPath, decision, detail, sessionId = "") {
  logDecision(logPath, decision, detail, 0, sessionId);
}

// src/commands/status.ts
function handleStatus(statePath) {
  const state = loadState(statePath);
  return {
    sessions: state.sessions,
    jobs: state.jobs
  };
}

// src/runtime.ts
function resolvePaths() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? "";
  const pluginData = process.env.CLAUDE_PLUGIN_DATA ?? (() => {
    if (pluginRoot) {
      const name = path6.basename(pluginRoot);
      const marketplace = path6.basename(path6.dirname(pluginRoot));
      return path6.join(os3.homedir(), ".claude", "plugins", "data", `${name}-${marketplace}`);
    }
    return path6.join(os3.homedir(), ".claude", "plugins", "data", "self-evolution-self-evolution-marketplace");
  })();
  return {
    statePath: path6.join(pluginData, "state.json"),
    logPath: path6.join(process.env.SELF_EVOLUTION_LOG_DIR ?? path6.join(os3.homedir(), ".claude", "logs"), "self-evolution.jsonl"),
    pluginRoot,
    pluginData
  };
}
function getNudgeInterval() {
  const env = process.env.SELF_EVOLUTION_NUDGE_INTERVAL;
  if (env) return parseInt(env, 10);
  const opt = process.env.CLAUDE_PLUGIN_OPTION_nudge_interval;
  if (opt) return parseInt(opt, 10);
  return 10;
}
function getMaxSkillSize() {
  const env = process.env.SELF_EVOLUTION_MAX_SKILL_SIZE;
  if (env) return parseInt(env, 10);
  const opt = process.env.CLAUDE_PLUGIN_OPTION_max_skill_size_kb;
  if (opt) return parseInt(opt, 10);
  return 15360;
}
function runCommand(command, args, stdinData) {
  const paths = resolvePaths();
  try {
    switch (command) {
      case "session-start":
        handleSessionStart(paths.logPath, {
          CLAUDE_PLUGIN_ROOT: process.env.CLAUDE_PLUGIN_ROOT ?? "",
          CLAUDE_PLUGIN_DATA: process.env.CLAUDE_PLUGIN_DATA ?? ""
        });
        return 0;
      case "post-tool-use": {
        if (!stdinData) return 0;
        const input = JSON.parse(stdinData);
        handlePostToolUse(paths.statePath, input, getNudgeInterval());
        return 0;
      }
      case "stop-gate": {
        if (!stdinData) return 0;
        const input = JSON.parse(stdinData);
        handleStopGate(paths.statePath, input, {
          pluginRoot: paths.pluginRoot,
          pluginData: paths.pluginData,
          reviewModel: process.env.CLAUDE_PLUGIN_OPTION_review_model,
          platform: process.env.CLAUDE_PLUGIN_OPTION_platform
        });
        return 0;
      }
      case "security-scan": {
        const scanArgs = parseSecurityScanArgs(args);
        if (!scanArgs.path || !scanArgs.content) {
          process.stdout.write(JSON.stringify({ allowed: false, reason: "missing --path or --content" }) + "\n");
          return 1;
        }
        scanArgs.maxSkillSize = scanArgs.maxSkillSize ?? getMaxSkillSize();
        const result = handleSecurityScan(scanArgs);
        process.stdout.write(JSON.stringify(result) + "\n");
        return 0;
      }
      case "review-context": {
        const transcriptPath = args[0] || process.env.SELF_EVOLUTION_TRANSCRIPT_PATH || "";
        const result = handleReviewContext({ transcriptPath });
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return 0;
      }
      case "log-decision": {
        const decision = args[0] || "unknown";
        const detail = args[1] || "";
        const sessionId = args[2] || "";
        handleLogDecision(paths.logPath, decision, detail, sessionId);
        return 0;
      }
      case "status": {
        const result = handleStatus(paths.statePath);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return 0;
      }
      default:
        process.stderr.write(`Unknown command: ${command}
`);
        return 1;
    }
  } catch (err) {
    process.stderr.write(`Error: ${err}
`);
    return 1;
  }
}
if (process.argv[1]?.endsWith("runtime.ts") || process.argv[1]?.endsWith("runtime.mjs")) {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  let stdinData = "";
  if (["post-tool-use", "stop-gate"].includes(command)) {
    try {
      const { readFileSync } = await import("node:fs");
      stdinData = readFileSync("/dev/stdin", "utf-8").trim();
    } catch {
    }
  }
  const exitCode = runCommand(command, args, stdinData);
  process.exit(exitCode);
}
export {
  runCommand
};
