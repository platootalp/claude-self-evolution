// src/runtime.ts
import fs8 from "node:fs";
import path7 from "node:path";
import os3 from "node:os";

// src/lib/config.ts
import fs from "node:fs";
import path from "node:path";
var DEFAULT_CONFIG = {
  nudge_interval: 10,
  max_skill_size: 15360,
  review_model: "sonnet",
  platform: "auto",
  category_whitelist: ["debug", "refactor", "test", "deploy", "data", "web", "cli", "meta"],
  meta_skill_name: "evolve-skill-writer",
  log_level: "info"
};
function loadConfig(pluginRoot) {
  for (const name of ["config.json", "config.default.json"]) {
    try {
      const raw = fs.readFileSync(path.join(pluginRoot, name), "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
    }
  }
  return { ...DEFAULT_CONFIG };
}
function resolveConfig(pluginRoot) {
  const config = loadConfig(pluginRoot);
  if (process.env.SELF_EVOLUTION_NUDGE_INTERVAL) config.nudge_interval = parseInt(process.env.SELF_EVOLUTION_NUDGE_INTERVAL, 10);
  if (process.env.SELF_EVOLUTION_MAX_SKILL_SIZE) config.max_skill_size = parseInt(process.env.SELF_EVOLUTION_MAX_SKILL_SIZE, 10);
  if (process.env.SELF_EVOLUTION_REVIEW_MODEL) config.review_model = process.env.SELF_EVOLUTION_REVIEW_MODEL;
  if (process.env.SELF_EVOLUTION_PLATFORM) config.platform = process.env.SELF_EVOLUTION_PLATFORM;
  if (process.env.SELF_EVOLUTION_LOG_LEVEL) config.log_level = process.env.SELF_EVOLUTION_LOG_LEVEL;
  return config;
}
function resolveLogLevel(config) {
  const level = config.log_level.toLowerCase();
  if (level === "off" || level === "info" || level === "debug") return level;
  return "info";
}

// src/lib/logger.ts
import fs2 from "node:fs";
import path2 from "node:path";
function appendLine(logPath, line) {
  try {
    const dir = path2.dirname(logPath);
    fs2.mkdirSync(dir, { recursive: true });
    fs2.appendFileSync(logPath, line + "\n", "utf-8");
  } catch {
  }
}
function shouldLog(level, eventLevel) {
  if (level === "off") return false;
  if (level === "debug") return true;
  return eventLevel === "info";
}
function createLogger(sessionsDir, sessionId, logLevel) {
  const logPath = path2.join(sessionsDir, sessionId, "log.jsonl");
  function writeEntry(eventLevel, event, kv) {
    if (!shouldLog(logLevel, eventLevel)) return;
    try {
      const entry = {
        ...kv,
        ts: (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z"),
        level: eventLevel,
        event,
        session_id: sessionId,
        pid: process.pid
      };
      appendLine(logPath, JSON.stringify(entry));
    } catch {
    }
  }
  return {
    info(event, kv) {
      writeEntry("info", event, kv);
    },
    debug(event, kv) {
      writeEntry("debug", event, kv);
    },
    logDecision(decision, detail, durationMs) {
      writeEntry("info", "review_decision", {
        decision,
        detail,
        duration_ms: durationMs
      });
    }
  };
}

// src/lib/state.ts
import fs3 from "node:fs";
import path3 from "node:path";
function loadState(statePath) {
  try {
    const raw = fs3.readFileSync(statePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { sessions: {}, jobs: [] };
  }
}
function saveState(statePath, state) {
  const dir = path3.dirname(statePath);
  fs3.mkdirSync(dir, { recursive: true });
  const tmpPath = statePath + ".tmp";
  fs3.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  fs3.renameSync(tmpPath, statePath);
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
function initSessionState(sessionsDir, sessionId, partial = {}) {
  const dir = path3.join(sessionsDir, sessionId);
  fs3.mkdirSync(dir, { recursive: true });
  const state = {
    count: 0,
    pending_review: false,
    start_ts: (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z"),
    ...partial
  };
  const statePath = path3.join(dir, "state.json");
  const tmpPath = statePath + ".tmp";
  fs3.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  fs3.renameSync(tmpPath, statePath);
}
function loadSessionState(sessionsDir, sessionId) {
  const statePath = path3.join(sessionsDir, sessionId, "state.json");
  try {
    const raw = fs3.readFileSync(statePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { count: 0, pending_review: false };
  }
}
function saveSessionState(sessionsDir, sessionId, state) {
  const dir = path3.join(sessionsDir, sessionId);
  fs3.mkdirSync(dir, { recursive: true });
  const statePath = path3.join(dir, "state.json");
  const tmpPath = statePath + ".tmp";
  fs3.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  fs3.renameSync(tmpPath, statePath);
}
function updateSessionResult(sessionsDir, sessionId, result) {
  const state = loadSessionState(sessionsDir, sessionId);
  Object.assign(state, result, { end_ts: (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z") });
  saveSessionState(sessionsDir, sessionId, state);
}
var EMPTY_STATS = {
  last_updated: "",
  total_sessions: 0,
  total_created: 0,
  total_updated: 0,
  total_skipped: 0,
  skip_reasons: {},
  recent_decisions: []
};
var MAX_RECENT_DECISIONS = 50;
function loadStats(statsPath) {
  try {
    const raw = fs3.readFileSync(statsPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { ...EMPTY_STATS, skip_reasons: {}, recent_decisions: [] };
  }
}
function saveStats(statsPath, stats) {
  const dir = path3.dirname(statsPath);
  fs3.mkdirSync(dir, { recursive: true });
  const tmpPath = statsPath + ".tmp";
  fs3.writeFileSync(tmpPath, JSON.stringify(stats, null, 2), "utf-8");
  fs3.renameSync(tmpPath, statsPath);
}
function updateStats(statsPath, decision, detail, sessionId, skillName) {
  const stats = loadStats(statsPath);
  stats.last_updated = (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  stats.total_sessions += 1;
  if (decision === "CREATED") stats.total_created += 1;
  else if (decision === "UPDATED") stats.total_updated += 1;
  else if (decision === "SKIPPED") {
    stats.total_skipped += 1;
    stats.skip_reasons[detail] = (stats.skip_reasons[detail] ?? 0) + 1;
  }
  const rd = {
    ts: stats.last_updated,
    session_id: sessionId,
    decision,
    detail,
    ...skillName ? { skill_name: skillName } : {}
  };
  stats.recent_decisions.unshift(rd);
  if (stats.recent_decisions.length > MAX_RECENT_DECISIONS) {
    stats.recent_decisions = stats.recent_decisions.slice(0, MAX_RECENT_DECISIONS);
  }
  saveStats(statsPath, stats);
}

// src/commands/session-start.ts
function handleSessionStart(sessionsDir, sessionId, logger, env) {
  initSessionState(sessionsDir, sessionId);
  logger.info("hook_triggered", {
    event: "session_start",
    CLAUDE_PLUGIN_ROOT: env.CLAUDE_PLUGIN_ROOT ?? "EMPTY",
    CLAUDE_PLUGIN_DATA: env.CLAUDE_PLUGIN_DATA ?? "EMPTY"
  });
  logger.debug("counter_state", { count: 0, pending_review: false });
}

// src/commands/post-tool-use.ts
function handlePostToolUse(statePath, sessionsDir, input, logger, threshold = 10) {
  if (!input.session_id) return 0;
  const stateBefore = loadState(statePath);
  const prevPending = stateBefore.sessions[input.session_id]?.pending_review ?? false;
  const newCount = incrementCount(statePath, input.session_id, threshold);
  const stateAfter = loadState(statePath);
  const nowPending = stateAfter.sessions[input.session_id]?.pending_review ?? false;
  logger.debug("counter_state", { count: newCount, pending_review: nowPending, session_id: input.session_id });
  if (!prevPending && nowPending) {
    logger.info("hook_triggered", { event: "post_tool_use", pending: true, session_id: input.session_id });
  }
  return newCount;
}

// src/lib/spawner.ts
import { spawn } from "node:child_process";
import fs4 from "node:fs";
import path4 from "node:path";
import crypto from "node:crypto";
function generateId() {
  return `job-${crypto.randomUUID().slice(0, 8)}`;
}
function buildReviewPrompt(opts, pluginRoot) {
  const templatePath = path4.join(pluginRoot, "prompts", "review-prompt.md");
  let template;
  try {
    template = fs4.readFileSync(templatePath, "utf-8");
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
function handleStopGate(statePath, sessionsDir, sessionId, input, options, logger) {
  if (input.stop_hook_active) {
    return { action: "allow", spawned: false };
  }
  if (!input.session_id || !input.transcript_path) {
    return { action: "allow", spawned: false };
  }
  const hasPending = consumePending(statePath, input.session_id);
  if (!hasPending) {
    logger.info("review_skipped", { reason: "no_pending_review", session_id: input.session_id });
    return { action: "allow", spawned: false };
  }
  try {
    const spawner = getSpawner(options.platform);
    const startTime = Date.now();
    const jobPromise = spawner.spawnReviewProcess({
      sessionId: input.session_id,
      transcriptPath: input.transcript_path,
      pluginRoot: options.pluginRoot,
      pluginData: options.pluginData,
      reviewModel: options.reviewModel
    });
    logger.info("review_launched", { session_id: input.session_id });
    jobPromise.then((job) => {
      addJob(statePath, job);
      const duration = Date.now() - startTime;
      logger.debug("spawn_completed", { exit_code: 0, duration_ms: duration, job_id: job.id, pid: job.pid });
    }).catch((err) => {
      const duration = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : String(err);
      logger.info("review_error", { error: msg, stage: "spawn", session_id: input.session_id, duration_ms: duration });
    });
    return { action: "allow", spawned: true, jobId: "pending" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.info("review_error", { error: msg, stage: "spawn", session_id: input.session_id });
    return { action: "allow", spawned: false };
  }
}

// src/lib/security.ts
import path5 from "node:path";
import os from "node:os";
var SKILLS_DIR = path5.join(os.homedir(), ".claude", "skills");
var PI_PATTERN = /(?:ignore previous|disregard above|<\||system:.*you are now|dump.*database|forget.*instructions)/i;
var BASH_PATTERN = /rm -rf \/(?: |$)|curl[^|]*\| *(?:ba)?sh|eval\s+\$\(|wget[^|]*-O\s*-/;
var SECRET_PATTERN = /(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----|ghp_[A-Za-z0-9]{36})/;
function scanWrite(targetPath, content, options = {}) {
  const maxSkillSize = options.maxSkillSize ?? 15360;
  const normalizedTarget = path5.normalize(targetPath);
  const normalizedSkillsDir = path5.normalize(SKILLS_DIR);
  const normalizedClaudeDir = path5.normalize(path5.join(os.homedir(), ".claude"));
  if (normalizedTarget.startsWith(normalizedClaudeDir + path5.sep) || normalizedTarget === normalizedClaudeDir) {
    const rel = path5.relative(normalizedSkillsDir, normalizedTarget);
    if (rel.startsWith("..") || path5.isAbsolute(rel)) {
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
function handleSecurityScan(args, logger) {
  const result = scanWrite(args.path, args.content, {
    maxSkillSize: args.maxSkillSize
  });
  if (!result.allowed) {
    logger?.info("security_blocked", {
      category: result.reason ?? "unknown",
      target_path: args.path
    });
  } else {
    logger?.debug("security_scan_detail", {
      target_path: args.path,
      result: "passed"
    });
  }
  return result;
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
import fs6 from "node:fs";
import path6 from "node:path";
import os2 from "node:os";

// src/lib/transcript.ts
import fs5 from "node:fs";
function parseTranscript(transcriptPath) {
  const summary = {
    toolCalls: [],
    userMessages: [],
    assistantMessages: [],
    totalTurns: 0
  };
  let raw;
  try {
    raw = fs5.readFileSync(transcriptPath, "utf-8").trim();
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
function handleReviewContext(options, logger) {
  const skillsDir = options.skillsDir ?? path6.join(os2.homedir(), ".claude", "skills");
  const transcript = parseTranscript(options.transcriptPath);
  let existingSkills = [];
  try {
    const entries = fs6.readdirSync(skillsDir, { withFileTypes: true });
    existingSkills = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
  }
  logger?.debug("context_retrieved", {
    session_id: options.sessionId ?? "unknown",
    transcript_length: transcript.toolCalls.length,
    total_turns: transcript.totalTurns,
    skills_count: existingSkills.length
  });
  return {
    toolCalls: transcript.toolCalls,
    userMessages: transcript.userMessages,
    assistantMessages: transcript.assistantMessages,
    totalTurns: transcript.totalTurns,
    existingSkills
  };
}

// src/commands/log-decision.ts
function handleLogDecision(sessionsDir, statsPath, sessionId, decision, detail, logger) {
  logger.logDecision(decision, detail, 0);
  if (decision === "CREATED" || decision === "UPDATED" || decision === "SKIPPED") {
    const skillName = decision !== "SKIPPED" ? extractSkillName(detail) : void 0;
    updateStats(statsPath, decision, detail, sessionId, skillName);
    updateSessionResult(sessionsDir, sessionId, {
      review_decision: decision,
      review_detail: detail,
      ...skillName ? { skill_name: skillName } : {}
    });
    if (skillName) {
      logger.info("skill_written", { skill_name: skillName });
    }
  }
}
function extractSkillName(detail) {
  const match = detail.match(/skill[_\s-]?name[:\s=]+(\S+)/i);
  return match ? match[1] : void 0;
}

// src/commands/status.ts
import fs7 from "node:fs";
function handleStatus(statePath, statsPath) {
  const state = loadState(statePath);
  let stats = null;
  if (fs7.existsSync(statsPath)) {
    stats = loadStats(statsPath);
  }
  return {
    active: {
      sessions: state.sessions,
      jobs: state.jobs
    },
    stats
  };
}

// src/runtime.ts
function resolvePaths() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? "";
  const pluginData = process.env.CLAUDE_PLUGIN_DATA ?? (() => {
    if (pluginRoot) {
      const name = path7.basename(pluginRoot);
      const marketplace = path7.basename(path7.dirname(pluginRoot));
      return path7.join(os3.homedir(), ".claude", "plugins", "data", `${name}-${marketplace}`);
    }
    return path7.join(os3.homedir(), ".claude", "plugins", "data", "self-evolution-self-evolution-marketplace");
  })();
  const config = resolveConfig(pluginRoot);
  return {
    statePath: path7.join(pluginData, "state.json"),
    sessionsDir: path7.join(pluginData, "sessions"),
    statsPath: path7.join(pluginData, "stats.json"),
    pluginRoot,
    pluginData,
    config
  };
}
function runCommand(command, args, stdinData) {
  const { statePath, sessionsDir, statsPath, pluginRoot, pluginData, config } = resolvePaths();
  const logLevel = resolveLogLevel(config);
  try {
    switch (command) {
      case "session-start": {
        const sessionId = process.env.SELF_EVOLUTION_SESSION_ID ?? `session-${Date.now()}`;
        const logger = createLogger(sessionsDir, sessionId, logLevel);
        handleSessionStart(sessionsDir, sessionId, logger, {
          CLAUDE_PLUGIN_ROOT: process.env.CLAUDE_PLUGIN_ROOT ?? "",
          CLAUDE_PLUGIN_DATA: process.env.CLAUDE_PLUGIN_DATA ?? ""
        });
        return 0;
      }
      case "post-tool-use": {
        if (!stdinData) return 0;
        const input = JSON.parse(stdinData);
        const sessionId = input.session_id ?? process.env.SELF_EVOLUTION_SESSION_ID ?? "unknown";
        const logger = createLogger(sessionsDir, sessionId, logLevel);
        handlePostToolUse(statePath, sessionsDir, input, logger, config.nudge_interval);
        return 0;
      }
      case "stop-gate": {
        if (!stdinData) return 0;
        const input = JSON.parse(stdinData);
        const sessionId = input.session_id ?? process.env.SELF_EVOLUTION_SESSION_ID ?? "unknown";
        const logger = createLogger(sessionsDir, sessionId, logLevel);
        handleStopGate(statePath, sessionsDir, sessionId, input, {
          pluginRoot,
          pluginData,
          reviewModel: config.review_model,
          platform: config.platform
        }, logger);
        return 0;
      }
      case "security-scan": {
        const scanArgs = parseSecurityScanArgs(args);
        if (!scanArgs.path || !scanArgs.content) {
          process.stdout.write(JSON.stringify({ allowed: false, reason: "missing --path or --content" }) + "\n");
          return 1;
        }
        scanArgs.maxSkillSize = scanArgs.maxSkillSize ?? config.max_skill_size;
        const sessionId = process.env.SELF_EVOLUTION_SESSION_ID ?? "unknown";
        const logger = createLogger(sessionsDir, sessionId, logLevel);
        const result = handleSecurityScan(scanArgs, logger);
        process.stdout.write(JSON.stringify(result) + "\n");
        return 0;
      }
      case "review-context": {
        const transcriptPath = args[0] || process.env.SELF_EVOLUTION_TRANSCRIPT_PATH || "";
        const sessionId = process.env.SELF_EVOLUTION_SESSION_ID ?? "unknown";
        const logger = createLogger(sessionsDir, sessionId, logLevel);
        const result = handleReviewContext({ transcriptPath, sessionId }, logger);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return 0;
      }
      case "log-decision": {
        const decision = args[0] || "unknown";
        const detail = args[1] || "";
        const sessionId = args[2] || (process.env.SELF_EVOLUTION_SESSION_ID ?? "unknown");
        const logger = createLogger(sessionsDir, sessionId, logLevel);
        handleLogDecision(sessionsDir, statsPath, sessionId, decision, detail, logger);
        return 0;
      }
      case "status": {
        const result = handleStatus(statePath, statsPath);
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
      stdinData = fs8.readFileSync("/dev/stdin", "utf-8").trim();
    } catch {
    }
  }
  const exitCode = runCommand(command, args, stdinData);
  process.exit(exitCode);
}
export {
  runCommand
};
