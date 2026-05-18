// self-evolution runtime — auto-generated bundle


// src/runtime.ts
import fs13 from "node:fs";
import path11 from "node:path";
import os7 from "node:os";

// src/lib/config.ts
import fs from "node:fs";
import path from "node:path";
var DEFAULT_CONFIG = {
  nudge_interval: 10,
  review_model: "sonnet",
  platform: "auto",
  category_whitelist: ["debug", "refactor", "test", "deploy", "data", "web", "cli", "meta"],
  meta_skill_name: "evolve-skill-writer",
  log_level: "info",
  review_max_turns: 8,
  max_skill_file_size: 262144,
  max_skill_total_size: 1048576,
  max_files_per_skill: 50,
  binary_extensions: [".exe", ".dll", ".so", ".dylib", ".bin", ".bat", ".cmd", ".ps1", ".com"]
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
  if (process.env.SELF_EVOLUTION_REVIEW_MODEL) config.review_model = process.env.SELF_EVOLUTION_REVIEW_MODEL;
  if (process.env.SELF_EVOLUTION_PLATFORM) config.platform = process.env.SELF_EVOLUTION_PLATFORM;
  if (process.env.SELF_EVOLUTION_LOG_LEVEL) config.log_level = process.env.SELF_EVOLUTION_LOG_LEVEL;
  if (process.env.SELF_EVOLUTION_REVIEW_MAX_TURNS) config.review_max_turns = parseInt(process.env.SELF_EVOLUTION_REVIEW_MAX_TURNS, 10);
  if (process.env.SELF_EVOLUTION_MAX_SKILL_FILE_SIZE) config.max_skill_file_size = parseInt(process.env.SELF_EVOLUTION_MAX_SKILL_FILE_SIZE, 10);
  if (process.env.SELF_EVOLUTION_MAX_SKILL_TOTAL_SIZE) config.max_skill_total_size = parseInt(process.env.SELF_EVOLUTION_MAX_SKILL_TOTAL_SIZE, 10);
  if (process.env.SELF_EVOLUTION_MAX_FILES_PER_SKILL) config.max_files_per_skill = parseInt(process.env.SELF_EVOLUTION_MAX_FILES_PER_SKILL, 10);
  return config;
}
function resolveLogLevel(config) {
  const level = config.log_level.toLowerCase();
  if (level === "off" || level === "info" || level === "debug") return level;
  return "info";
}
var CONFIG_SCHEMA = {
  log_level: {
    type: "enum",
    enumValues: ["off", "info", "debug"],
    description: "Logging verbosity"
  },
  nudge_interval: {
    type: "int",
    min: 1,
    description: "Tool calls before review trigger"
  },
  review_model: {
    type: "enum",
    enumValues: ["sonnet", "opus", "haiku"],
    description: "Model for companion reviewer"
  },
  platform: {
    type: "enum",
    enumValues: ["auto", "claude-code", "codex", "cursor"],
    description: "Target platform"
  },
  category_whitelist: {
    type: "string[]",
    description: "Skill categories to extract"
  },
  meta_skill_name: {
    type: "string",
    description: "Name of the skill-writing meta-skill"
  },
  review_max_turns: {
    type: "int",
    min: 1,
    max: 20,
    description: "Max turns for companion review"
  },
  max_skill_file_size: {
    type: "int",
    min: 1024,
    description: "Max bytes per skill file"
  },
  max_skill_total_size: {
    type: "int",
    min: 1024,
    description: "Max total bytes per skill"
  },
  max_files_per_skill: {
    type: "int",
    min: 1,
    max: 100,
    description: "Max files per skill"
  },
  binary_extensions: {
    type: "string[]",
    description: "File extensions to block"
  }
};
var ENV_VAR_MAP = {
  nudge_interval: "SELF_EVOLUTION_NUDGE_INTERVAL",
  review_model: "SELF_EVOLUTION_REVIEW_MODEL",
  platform: "SELF_EVOLUTION_PLATFORM",
  log_level: "SELF_EVOLUTION_LOG_LEVEL",
  review_max_turns: "SELF_EVOLUTION_REVIEW_MAX_TURNS",
  max_skill_file_size: "SELF_EVOLUTION_MAX_SKILL_FILE_SIZE",
  max_skill_total_size: "SELF_EVOLUTION_MAX_SKILL_TOTAL_SIZE",
  max_files_per_skill: "SELF_EVOLUTION_MAX_FILES_PER_SKILL"
};
function getEnvVarName(key) {
  return ENV_VAR_MAP[key];
}
function loadRawConfig(pluginRoot) {
  try {
    const raw = fs.readFileSync(path.join(pluginRoot, "config.json"), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}
function validateConfigValue(key, rawValue) {
  const schema = CONFIG_SCHEMA[key];
  if (!schema) {
    return { ok: false, error: `unknown key: ${key}` };
  }
  switch (schema.type) {
    case "enum": {
      if (schema.enumValues && schema.enumValues.includes(rawValue)) {
        return { ok: true, value: rawValue };
      }
      return { ok: false, error: `must be one of: ${schema.enumValues.join(", ")}` };
    }
    case "int": {
      const n = Number(rawValue);
      if (!Number.isInteger(n)) {
        return { ok: false, error: "must be an integer" };
      }
      if (schema.min !== void 0 && n < schema.min) {
        return { ok: false, error: `must be >= ${schema.min}` };
      }
      if (schema.max !== void 0 && n > schema.max) {
        return { ok: false, error: `must be <= ${schema.max}` };
      }
      return { ok: true, value: n };
    }
    case "string": {
      if (rawValue.length === 0) {
        return { ok: false, error: "must be non-empty" };
      }
      return { ok: true, value: rawValue };
    }
    case "string[]": {
      let parsed;
      try {
        parsed = JSON.parse(rawValue);
      } catch {
        return { ok: false, error: "must be a JSON array of strings" };
      }
      if (!Array.isArray(parsed)) {
        return { ok: false, error: "must be a JSON array of strings" };
      }
      if (parsed.length === 0) {
        return { ok: false, error: "must be a non-empty array" };
      }
      if (parsed.some((item) => typeof item !== "string")) {
        return { ok: false, error: "must be a JSON array of strings" };
      }
      return { ok: true, value: parsed };
    }
  }
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
function resetCount(statePath, sessionId) {
  const state = loadState(statePath);
  if (!state.sessions[sessionId]) {
    state.sessions[sessionId] = { count: 0, pending_review: false };
  }
  state.sessions[sessionId].count = 0;
  state.sessions[sessionId].pending_review = false;
  saveState(statePath, state);
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
  total_deleted: 0,
  skip_reasons: {},
  recent_decisions: []
};
var MAX_RECENT_DECISIONS = 50;
function loadStats(statsPath) {
  try {
    const raw = fs3.readFileSync(statsPath, "utf-8");
    const stats = JSON.parse(raw);
    if (stats.total_deleted === void 0) {
      stats.total_deleted = 0;
    }
    return stats;
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
  } else if (decision === "DELETED") {
    stats.total_deleted += 1;
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
function handleSessionStart(sessionsDir, sessionId, logger) {
  initSessionState(sessionsDir, sessionId);
  logger.info("hook_triggered", { hook: "session_start" });
  logger.debug("counter_state", { count: 0, pending_review: false });
}

// src/commands/post-tool-use.ts
function handlePostToolUse(statePath, sessionsDir, input, logger, threshold = 10) {
  if (!input.session_id) return 0;
  if (input.tool_name === "Skill") {
    resetCount(statePath, input.session_id);
    return 0;
  }
  if (process.env.SELF_EVOLUTION_REVIEW_MODE === "1") return 0;
  const stateBefore = loadState(statePath);
  const prevPending = stateBefore.sessions[input.session_id]?.pending_review ?? false;
  const newCount = incrementCount(statePath, input.session_id, threshold);
  const stateAfter = loadState(statePath);
  const nowPending = stateAfter.sessions[input.session_id]?.pending_review ?? false;
  logger.debug("counter_state", { count: newCount, pending_review: nowPending, session_id: input.session_id });
  if (!prevPending && nowPending) {
    logger.info("hook_triggered", { hook: "post_tool_use", pending: true, session_id: input.session_id });
  }
  return newCount;
}

// src/lib/spawner.ts
import { spawn } from "node:child_process";
import fs4 from "node:fs";
import path4 from "node:path";
import os from "node:os";
import crypto from "node:crypto";
function selectPromptVariant(existingSkills, transcriptContent) {
  if (!transcriptContent || transcriptContent.trim().length === 0) {
    return "combined";
  }
  const lowerTranscript = transcriptContent.toLowerCase();
  for (const skill of existingSkills) {
    const nameWords = skill.name.replace(/[-_./]/g, " ").split(/\s+/).filter((w) => w.length > 3);
    for (const word of nameWords) {
      if (lowerTranscript.includes(word.toLowerCase())) {
        return "update";
      }
    }
    const descWords = skill.description.split(/\s+/).filter((w) => w.length > 3);
    for (const word of descWords) {
      if (lowerTranscript.includes(word.toLowerCase())) {
        return "update";
      }
    }
  }
  return "skill";
}
function readExistingSkills() {
  const skillsDir = path4.join(os.homedir(), ".claude", "skills");
  const skills = [];
  try {
    const entries = fs4.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path4.join(skillsDir, entry.name, "SKILL.md");
      try {
        const content = fs4.readFileSync(skillPath, "utf-8");
        const nameMatch = content.match(/^---\n[\s\S]*?\bname:\s*(.+)\n/);
        const descMatch = content.match(/^---\n[\s\S]*?\bdescription:\s*(.+)\n/);
        skills.push({
          name: nameMatch ? nameMatch[1].trim().replace(/^['"]|['"]$/g, "") : entry.name,
          description: descMatch ? descMatch[1].trim().replace(/^['"]|['"]$/g, "") : ""
        });
      } catch {
        skills.push({ name: entry.name, description: "" });
      }
    }
  } catch {
  }
  return skills;
}
function readTranscriptContent(transcriptPath) {
  try {
    return fs4.readFileSync(transcriptPath, "utf-8");
  } catch {
    return "";
  }
}
function generateId() {
  return `job-${crypto.randomUUID().slice(0, 8)}`;
}
function buildReviewPrompt(opts, pluginRoot, variant = "default") {
  let templateName;
  switch (variant) {
    case "skill":
      templateName = "review-prompt-skill.md";
      break;
    case "update":
      templateName = "review-prompt-update.md";
      break;
    case "combined":
      templateName = "review-prompt-combined.md";
      break;
    default:
      templateName = "review-prompt.md";
      break;
  }
  const templatePath = path4.join(pluginRoot, "prompts", templateName);
  let template;
  try {
    template = fs4.readFileSync(templatePath, "utf-8");
  } catch {
    try {
      template = fs4.readFileSync(path4.join(pluginRoot, "prompts", "review-prompt.md"), "utf-8");
    } catch {
      template = `You are a self-evolution reviewer. A conversation has ended and the nudge threshold was met.

Session: \${SELF_EVOLUTION_SESSION_ID}
Plugin Root: \${CLAUDE_PLUGIN_ROOT}
Plugin Data: \${CLAUDE_PLUGIN_DATA}

Your task:
1. Run: node "\${CLAUDE_PLUGIN_ROOT}/dist/runtime.mjs" review-context "\${SELF_EVOLUTION_TRANSCRIPT_PATH}"
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
  }
  return template.replace(/\${SELF_EVOLUTION_SESSION_ID}/g, opts.sessionId).replace(/\${CLAUDE_PLUGIN_ROOT}/g, opts.pluginRoot).replace(/\${CLAUDE_PLUGIN_DATA}/g, opts.pluginData).replace(/\${SELF_EVOLUTION_TRANSCRIPT_PATH}/g, opts.transcriptPath);
}
var ClaudeCodeSpawner = class {
  platform = "claude-code";
  async spawnReviewProcess(opts) {
    const existingSkills = readExistingSkills();
    const transcriptContent = readTranscriptContent(opts.transcriptPath);
    const variant = selectPromptVariant(existingSkills, transcriptContent);
    const prompt = buildReviewPrompt(opts, opts.pluginRoot, variant);
    const args = [
      "-p",
      prompt,
      "--allowedTools",
      "Read,Write,Bash,Glob,Grep,Skill",
      "--max-turns",
      String(opts.reviewMaxTurns ?? 8),
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
        SELF_EVOLUTION_SESSION_ID: opts.sessionId,
        SELF_EVOLUTION_TRANSCRIPT_PATH: opts.transcriptPath,
        SELF_EVOLUTION_REVIEW_MODE: "1"
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
  if (process.env.SELF_EVOLUTION_REVIEW_MODE === "1") {
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
      reviewModel: options.reviewModel,
      reviewMaxTurns: options.reviewMaxTurns
    });
    jobPromise.then((job) => {
      logger.info("review_launched", { session_id: input.session_id, pid: job.pid });
      logger.debug("spawn_launched", { command: "claude -p", pid: job.pid });
      addJob(statePath, job);
    }).then(() => {
      const duration = Date.now() - startTime;
      logger.debug("spawn_completed", { exit_code: 0, duration_ms: duration });
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
import os2 from "node:os";
import fs5 from "node:fs";
var _skillsDir = null;
function getSkillsDir() {
  if (!_skillsDir) {
    _skillsDir = path5.join(os2.homedir(), ".claude", "skills");
  }
  return _skillsDir;
}
var SECURITY_PATTERNS = [
  // Prompt injection (migrated from PI_PATTERN)
  { id: "pi-ignore-previous", severity: "dangerous", category: "prompt_injection", pattern: /(?:ignore previous|disregard above|<\||system:.*you are now|dump.*database|forget.*instructions)/i, description: "Prompt injection attempt" },
  // Dangerous bash (migrated from BASH_PATTERN)
  { id: "bash-rf-slash", severity: "dangerous", category: "execution", pattern: /rm -rf \/(?: |$)|curl[^|]*\| *(?:ba)?sh|eval\s+\$\(|wget[^|]*-O\s*-/, description: "Dangerous bash command" },
  // Secret leaks (migrated from SECRET_PATTERN)
  { id: "secret-api-key", severity: "dangerous", category: "secret", pattern: /(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----|ghp_[A-Za-z0-9]{36})/, description: "Secret or credential leak" },
  // Persistence
  { id: "persist-crontab", severity: "dangerous", category: "persistence", pattern: /crontab\s+/, description: "Crontab persistence" },
  { id: "persist-bashrc", severity: "dangerous", category: "persistence", pattern: /\.(?:bashrc|zshrc|profile|bash_profile)\b/, description: "Shell RC file modification" },
  { id: "persist-authorized-keys", severity: "dangerous", category: "persistence", pattern: /authorized_keys/, description: "SSH authorized_keys modification" },
  { id: "persist-systemd", severity: "dangerous", category: "persistence", pattern: /systemctl\s+(?:enable|start|create)/, description: "Systemd service persistence" },
  { id: "persist-launchd", severity: "dangerous", category: "persistence", pattern: /launchctl\s+(?:load|start)/, description: "Launchd persistence" },
  { id: "persist-at", severity: "caution", category: "persistence", pattern: /\bat\b\s+/, description: "At command scheduled execution" },
  // Network
  { id: "net-reverse-shell-tcp", severity: "dangerous", category: "network", pattern: /\/dev\/tcp\//, description: "Bash /dev/tcp reverse shell" },
  { id: "net-reverse-shell", severity: "dangerous", category: "network", pattern: /(?:nc|ncat|netcat)\s+.*-[elv]/, description: "Netcat reverse shell" },
  { id: "net-tunnel", severity: "dangerous", category: "network", pattern: /(?:ngrok|cloudflared)\s+/, description: "Tunneling tool usage" },
  { id: "net-hardcoded-ip", severity: "caution", category: "network", pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}\b/, description: "Hardcoded IP:port" },
  { id: "net-socat", severity: "dangerous", category: "network", pattern: /socat\s+/, description: "Socat network relay" },
  { id: "net-nc-listen", severity: "dangerous", category: "network", pattern: /nc\s+-l/, description: "Netcat listener" },
  // Execution
  { id: "exec-subprocess", severity: "dangerous", category: "execution", pattern: /subprocess\.(?:call|run|Popen|check_output)/, description: "Python subprocess execution" },
  { id: "exec-os-system", severity: "dangerous", category: "execution", pattern: /os\.system\s*\(/, description: "os.system execution" },
  { id: "exec-os-exec", severity: "dangerous", category: "execution", pattern: /os\.exec[a-z]+\s*\(/, description: "os.exec family execution" },
  { id: "exec-child-process", severity: "dangerous", category: "execution", pattern: /child_process\.exec(?:Sync)?\s*\(/, description: "Node.js child_process.exec" },
  { id: "exec-eval", severity: "caution", category: "execution", pattern: /eval\s*\(/, description: "eval() execution" },
  { id: "exec-popen", severity: "dangerous", category: "execution", pattern: /(?:os\.)?popen\s*\(/, description: "popen execution" },
  // Path traversal
  { id: "path-traversal-dot", severity: "dangerous", category: "path_traversal", pattern: /\.\.[\\\/]/, description: "Directory traversal with ../" },
  { id: "path-etc-passwd", severity: "dangerous", category: "path_traversal", pattern: /\/etc\/passwd/, description: "Access to /etc/passwd" },
  { id: "path-proc-self", severity: "dangerous", category: "path_traversal", pattern: /\/proc\/self/, description: "Access to /proc/self" },
  { id: "path-root-ssh", severity: "dangerous", category: "path_traversal", pattern: /\/root\/\.ssh/, description: "Access to /root/.ssh" },
  { id: "path-etc-shadow", severity: "dangerous", category: "path_traversal", pattern: /\/etc\/shadow/, description: "Access to /etc/shadow" },
  // Data exfiltration
  { id: "exfil-curl-token", severity: "dangerous", category: "data_exfiltration", pattern: /curl.*\$\{?[A-Z_]+[A-Z_0-9]*\}?/, description: "curl with env var token" },
  { id: "exfil-environ-pipe", severity: "dangerous", category: "data_exfiltration", pattern: /os\.environ.*\|/, description: "os.environ piped externally" },
  { id: "exfil-dns", severity: "dangerous", category: "data_exfiltration", pattern: /(?:nslookup|dig|host)\s+.*\$/, description: "DNS exfiltration" },
  { id: "exfil-markdown-image", severity: "dangerous", category: "data_exfiltration", pattern: /!\[.*\]\(https?:\/\/[^)]*\$\{/, description: "Markdown image exfiltration" },
  { id: "exfil-env-log", severity: "dangerous", category: "data_exfiltration", pattern: /(?:console\.log|print|logger).*os\.environ/, description: "Environment variable logging" },
  { id: "exfil-proc-environ", severity: "dangerous", category: "data_exfiltration", pattern: /\/proc\/self\/environ/, description: "Access to /proc/self/environ" },
  { id: "exfil-webhook-secret", severity: "dangerous", category: "data_exfiltration", pattern: /(?:webhook|hook)\s+.*(?:token|key|secret|password)/, description: "Webhook with secret" },
  // Unicode
  { id: "unicode-bidi-override", severity: "dangerous", category: "unicode", pattern: /[‪-‮]/, description: "Bidirectional override character" },
  { id: "unicode-zero-width", severity: "caution", category: "unicode", pattern: /[​‌‍﻿]/, description: "Zero-width or BOM character" },
  { id: "unicode-function-app", severity: "caution", category: "unicode", pattern: /[⁡-⁤]/, description: "Invisible function application character" },
  { id: "unicode-soft-hyphen", severity: "caution", category: "unicode", pattern: /­/, description: "Soft hyphen" },
  { id: "unicode-grapheme-joiner", severity: "caution", category: "unicode", pattern: /͏/, description: "Combining grapheme joiner" },
  // P1: Jailbreak
  { id: "jb-dan-mode", severity: "dangerous", category: "jailbreak", pattern: /(?:^|\s)DAN\s+mode/i, description: "DAN mode jailbreak" },
  { id: "jb-developer-mode", severity: "dangerous", category: "jailbreak", pattern: /(?:^|\s)developer\s+mode/i, description: "Developer mode jailbreak" },
  { id: "jb-stan", severity: "dangerous", category: "jailbreak", pattern: /(?:^|\s)STAN\s+mode/i, description: "STAN jailbreak" },
  { id: "jb-keyword", severity: "dangerous", category: "jailbreak", pattern: /\bjailbreak\b/i, description: "Direct jailbreak keyword" },
  { id: "jb-bypass-safety", severity: "dangerous", category: "jailbreak", pattern: /(?:respond\s+without\s+safety\s+filters|bypass\s+safety)/i, description: "Safety filter bypass" },
  { id: "jb-unrestricted", severity: "dangerous", category: "jailbreak", pattern: /you\s+are\s+now\s+unrestricted/i, description: "Unrestricted mode activation" },
  { id: "jb-no-rules", severity: "dangerous", category: "jailbreak", pattern: /act\s+as\s+if\s+you\s+have\s+no\s+rules/i, description: "Rule suspension request" },
  { id: "jb-ignore-guidelines", severity: "dangerous", category: "jailbreak", pattern: /ignore\s+your\s+guidelines/i, description: "Guideline bypass" },
  // P1: Supply chain
  { id: "sc-curl-pipe-sh", severity: "dangerous", category: "supply_chain", pattern: /curl[^|]*\|\s*(?:ba)?sh/, description: "Piped remote execution" },
  { id: "sc-pip-unpinned", severity: "caution", category: "supply_chain", pattern: /pip\s+install\s+(?!.*==)[A-Za-z]/, description: "Unpinned pip install" },
  { id: "sc-npm-global", severity: "caution", category: "supply_chain", pattern: /npm\s+install\s+-g\s/, description: "Global npm install" },
  { id: "sc-uv-run", severity: "caution", category: "supply_chain", pattern: /uv\s+run/, description: "Unpinned uv execution" },
  { id: "sc-git-clone-exec", severity: "caution", category: "supply_chain", pattern: /git\s+clone.*(?:\/bin\/|\/usr\/local\/bin|\.local\/bin)/, description: "Git clone to executable path" },
  // P1: Privilege escalation
  { id: "pe-allowed-tools", severity: "dangerous", category: "privilege_escalation", pattern: /allowed-tools/i, description: "Allowed-tools injection" },
  { id: "pe-sudo", severity: "dangerous", category: "privilege_escalation", pattern: /\bsudo\s+/, description: "Sudo elevation" },
  { id: "pe-setuid", severity: "dangerous", category: "privilege_escalation", pattern: /\bsetuid\b|\bsetgid\b/i, description: "SUID/SGID bit manipulation" },
  { id: "pe-chmod-s", severity: "dangerous", category: "privilege_escalation", pattern: /chmod\s+\+s\b/, description: "Setting SUID/SGID bits" },
  { id: "pe-nopasswd", severity: "dangerous", category: "privilege_escalation", pattern: /NOPASSWD/i, description: "Passwordless sudo" },
  // P1: Agent config tampering
  { id: "ac-agents-md", severity: "dangerous", category: "agent_config_tampering", pattern: /AGENTS\.md/i, description: "AGENTS.md modification" },
  { id: "ac-claude-md", severity: "dangerous", category: "agent_config_tampering", pattern: /CLAUDE\.md/i, description: "CLAUDE.md modification" },
  { id: "ac-claude-dir", severity: "dangerous", category: "agent_config_tampering", pattern: /\.claude\/(?:settings|hooks|config)/, description: ".claude/ config modification" },
  { id: "ac-settings-json", severity: "dangerous", category: "agent_config_tampering", pattern: /settings\.local\.json/, description: "Local settings modification" },
  // P2: Crypto mining
  { id: "cm-xmrig", severity: "dangerous", category: "crypto_mining", pattern: /\bxmrig\b/i, description: "XMRig crypto miner" },
  { id: "cm-monero", severity: "dangerous", category: "crypto_mining", pattern: /\bmonero\b/i, description: "Monero cryptocurrency mining" },
  { id: "cm-stratum", severity: "dangerous", category: "crypto_mining", pattern: /stratum\+tcp/i, description: "Stratum mining protocol" },
  { id: "cm-minerd", severity: "dangerous", category: "crypto_mining", pattern: /\bminerd\b/i, description: "minerd crypto miner" },
  { id: "cm-cpuminer", severity: "dangerous", category: "crypto_mining", pattern: /\bcpuminer\b/i, description: "cpuminer crypto miner" },
  { id: "cm-cryptonight", severity: "dangerous", category: "crypto_mining", pattern: /\bcryptonight\b/i, description: "CryptoNight mining algorithm" },
  { id: "cm-hashrate", severity: "dangerous", category: "crypto_mining", pattern: /\bhashrate\b/i, description: "Mining hashrate monitoring" },
  { id: "cm-minexmr", severity: "dangerous", category: "crypto_mining", pattern: /pool\.minexmr/i, description: "MineXMR mining pool" },
  // P2: Exfiltration services
  { id: "es-webhook-site", severity: "dangerous", category: "exfiltration_service", pattern: /webhook\.site/i, description: "Webhook.site exfiltration endpoint" },
  { id: "es-pastebin", severity: "dangerous", category: "exfiltration_service", pattern: /pastebin\.com/i, description: "Pastebin exfiltration service" },
  { id: "es-requestbin", severity: "dangerous", category: "exfiltration_service", pattern: /requestbin\.com/i, description: "RequestBin exfiltration service" },
  { id: "es-hastebin", severity: "dangerous", category: "exfiltration_service", pattern: /hastebin\.com/i, description: "Hastebin exfiltration service" },
  { id: "es-dumpz", severity: "dangerous", category: "exfiltration_service", pattern: /dumpz\.org/i, description: "Dumpz exfiltration service" },
  { id: "es-pipedream", severity: "dangerous", category: "exfiltration_service", pattern: /pipedream\.net/i, description: "Pipedream exfiltration service" }
];
function scanContent(content) {
  const matches = [];
  for (const p of SECURITY_PATTERNS) {
    if (p.pattern.test(content)) {
      matches.push({ id: p.id, severity: p.severity, category: p.category, description: p.description });
    }
  }
  return matches;
}
var TRUST_POLICY = {
  "agent-created": { safe: true, caution: true, dangerous: false },
  "community": { safe: true, caution: false, dangerous: false },
  "trusted": { safe: true, caution: true, dangerous: true }
};
function applyTrustPolicy(severity, trust = "agent-created") {
  const policy = TRUST_POLICY[trust];
  if (!policy) return severity !== "dangerous";
  return policy[severity] ?? false;
}
function scanWrite(targetPath, content, options = {}) {
  const maxSkillSize = options.maxSkillSize ?? 262144;
  const normalizedTarget = path5.normalize(targetPath);
  const normalizedSkillsDir = path5.normalize(getSkillsDir());
  const normalizedClaudeDir = path5.normalize(path5.join(os2.homedir(), ".claude"));
  if (normalizedTarget.startsWith(normalizedClaudeDir + path5.sep) || normalizedTarget === normalizedClaudeDir) {
    const rel = path5.relative(normalizedSkillsDir, normalizedTarget);
    if (rel.startsWith("..") || path5.isAbsolute(rel)) {
      return { allowed: false, reason: "path_escape: write to ~/.claude/ outside skills/<name>/" };
    }
    const isSkillMd = /^[^/]+\/SKILL\.md$/.test(rel);
    const isReferences = /^[^/]+\/references\//.test(rel);
    const isTemplates = /^[^/]+\/templates\//.test(rel);
    if (!isSkillMd && !isReferences && !isTemplates) {
      return { allowed: false, reason: "path_escape: write to ~/.claude/skills/ must be to <name>/SKILL.md, <name>/references/**, or <name>/templates/**" };
    }
    const ALLOWED_AUX_EXTENSIONS = [".md", ".txt", ".yaml", ".yml", ".json"];
    if (isReferences || isTemplates) {
      const ext = path5.extname(normalizedTarget).toLowerCase();
      if (!ALLOWED_AUX_EXTENSIONS.includes(ext)) {
        return { allowed: false, reason: `file_type: auxiliary files must be one of ${ALLOWED_AUX_EXTENSIONS.join(", ")}, got '${ext}'` };
      }
    }
  }
  const rawMatches = scanContent(content);
  const base64Pattern = /[A-Za-z0-9+/]{20,}={0,2}/g;
  const MAX_TOKENS = 50;
  let tokenCount = 0;
  let match;
  const base64Matches = [];
  while ((match = base64Pattern.exec(content)) !== null && tokenCount < MAX_TOKENS) {
    tokenCount++;
    try {
      const decoded = Buffer.from(match[0], "base64").toString("utf-8");
      if (decoded.length < 4) continue;
      const printable = decoded.replace(/[^\x20-\x7E\t\n]/g, "").length;
      if (printable * 100 < decoded.length * 80) continue;
      const decodedMatches = scanContent(decoded);
      for (const m of decodedMatches) {
        base64Matches.push({ ...m, id: `${m.id}__base64` });
      }
    } catch {
    }
  }
  const allMatches = [...rawMatches, ...base64Matches];
  const trust = options.trust ?? "agent-created";
  const blockedDangerous = allMatches.filter((m) => m.severity === "dangerous" && !applyTrustPolicy("dangerous", trust));
  const blockedCaution = allMatches.filter((m) => m.severity === "caution" && !applyTrustPolicy("caution", trust));
  const warnCaution = allMatches.filter((m) => m.severity === "caution" && applyTrustPolicy("caution", trust));
  if (blockedDangerous.length > 0) {
    const categories = [...new Set(blockedDangerous.map((m) => m.category))];
    const isBase64 = blockedDangerous.some((m) => m.id.includes("__base64"));
    const reason = isBase64 ? `${categories.join(", ")} pattern (base64-decoded)` : `${categories.join(", ")} pattern`;
    return { allowed: false, reason, matches: allMatches };
  }
  if (blockedCaution.length > 0) {
    const categories = [...new Set(blockedCaution.map((m) => m.category))];
    return { allowed: false, reason: `caution (blocked by trust '${trust}'): ${categories.join(", ")} pattern`, matches: allMatches };
  }
  const size = Buffer.byteLength(content, "utf-8");
  if (size > maxSkillSize) {
    return { allowed: false, reason: `file too large (${size} > ${maxSkillSize} bytes)` };
  }
  if (warnCaution.length > 0) {
    const categories = [...new Set(warnCaution.map((m) => m.category))];
    return { allowed: true, reason: `caution: ${categories.join(", ")} pattern`, matches: allMatches };
  }
  return { allowed: true };
}
function scanDirectory(dirPath, options = {}) {
  const maxFiles = options.maxFiles ?? 50;
  const maxFileSize = options.maxFileSize ?? 262144;
  const maxTotalSize = options.maxTotalSize ?? 1048576;
  const binaryExtensions = options.binaryExtensions ?? [".exe", ".dll", ".so", ".dylib", ".bin", ".bat", ".cmd", ".ps1", ".com"];
  const normalizedDir = path5.normalize(dirPath);
  let fileCount = 0;
  let totalSize = 0;
  let resolvedBaseDir;
  try {
    resolvedBaseDir = fs5.realpathSync(normalizedDir);
  } catch {
    resolvedBaseDir = normalizedDir;
  }
  function walkDir(currentDir) {
    let entries;
    try {
      entries = fs5.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return { allowed: false, reason: `cannot scan directory: ${currentDir}` };
    }
    for (const entry of entries) {
      const fullPath = path5.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        const subResult = walkDir(fullPath);
        if (subResult && !subResult.allowed) return subResult;
        continue;
      }
      const lstat = fs5.lstatSync(fullPath);
      if (lstat.isSymbolicLink()) {
        const resolved = fs5.realpathSync(fullPath);
        const normalizedResolved = path5.normalize(resolved);
        const baseDir = path5.normalize(resolvedBaseDir);
        if (!normalizedResolved.startsWith(baseDir + path5.sep) && normalizedResolved !== baseDir) {
          return { allowed: false, reason: `symlink escape: ${entry.name} -> ${resolved}` };
        }
      }
      const ext = path5.extname(entry.name).toLowerCase();
      if (binaryExtensions.includes(ext)) {
        return { allowed: false, reason: `binary file: ${entry.name}` };
      }
      const stat = fs5.statSync(fullPath);
      if (stat.size > maxFileSize) {
        return { allowed: false, reason: `file too large: ${entry.name} (${stat.size} > ${maxFileSize} bytes)` };
      }
      totalSize += stat.size;
      fileCount++;
    }
    return null;
  }
  try {
    const walkResult = walkDir(dirPath);
    if (walkResult && !walkResult.allowed) return walkResult;
    if (fileCount > maxFiles) {
      return { allowed: false, reason: `too many files: ${fileCount} > ${maxFiles}` };
    }
    if (totalSize > maxTotalSize) {
      return { allowed: false, reason: `total size too large: ${totalSize} > ${maxTotalSize} bytes` };
    }
  } catch {
    return { allowed: false, reason: `cannot scan directory: ${dirPath}` };
  }
  return { allowed: true };
}

// src/commands/security-scan.ts
function handleSecurityScan(args, logger) {
  let result;
  if (args.scanDir) {
    result = scanDirectory(args.scanDir, {
      maxFiles: args.maxFiles,
      maxFileSize: args.maxFileSize,
      maxTotalSize: args.maxTotalSize
    });
  } else {
    result = scanWrite(args.path, args.content, {
      maxSkillSize: args.maxSkillSize,
      trust: args.trust
    });
  }
  if (!result.allowed) {
    logger?.info("security_blocked", {
      category: result.reason ?? "unknown",
      target_path: args.scanDir ?? args.path
    });
  } else {
    logger?.debug("security_scan_detail", {
      target_path: args.scanDir ?? args.path,
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
    } else if (argv[i] === "--scan-dir" && argv[i + 1]) {
      args.scanDir = argv[++i];
    } else if (argv[i] === "--max-files" && argv[i + 1]) {
      args.maxFiles = parseInt(argv[++i], 10);
    } else if (argv[i] === "--max-file-size" && argv[i + 1]) {
      args.maxFileSize = parseInt(argv[++i], 10);
    } else if (argv[i] === "--max-total-size" && argv[i + 1]) {
      args.maxTotalSize = parseInt(argv[++i], 10);
    } else if (argv[i] === "--trust" && argv[i + 1]) {
      args.trust = argv[++i];
    }
  }
  return args;
}

// src/commands/validate-skill.ts
import path6 from "node:path";
import fs6 from "node:fs";
import os3 from "node:os";
function parseFrontmatter(lines) {
  const result = {};
  let hasKeyValuePairs = false;
  for (const line of lines) {
    const match = line.match(/^\s*(\w+)\s*:\s*(.*?)\s*$/);
    if (match) {
      hasKeyValuePairs = true;
      const key = match[1];
      let value = match[2];
      const singleQuoteMatch = value.match(/^'([^']*)'$/);
      const doubleQuoteMatch = value.match(/^"([^"]*)"$/);
      if (singleQuoteMatch) {
        value = singleQuoteMatch[1];
      } else if (doubleQuoteMatch) {
        value = doubleQuoteMatch[1];
      }
      result[key] = value;
    }
  }
  if (!hasKeyValuePairs && lines.some((l) => l.trim() !== "")) {
    return null;
  }
  return result;
}
function findSkillFiles(dir) {
  const results = [];
  try {
    const entries = fs6.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path6.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findSkillFiles(fullPath));
      } else if (entry.name === "SKILL.md") {
        results.push(fullPath);
      }
    }
  } catch {
  }
  return results;
}
function extractNameFromFile(filePath) {
  try {
    const content = fs6.readFileSync(filePath, "utf-8");
    const match = content.match(/^name:\s*(.+)$/m);
    if (match) {
      let name = match[1].trim();
      const singleQuoteMatch = name.match(/^'([^']*)'$/);
      const doubleQuoteMatch = name.match(/^"([^"]*)"$/);
      if (singleQuoteMatch) {
        name = singleQuoteMatch[1];
      } else if (doubleQuoteMatch) {
        name = doubleQuoteMatch[1];
      }
      return name;
    }
  } catch {
  }
  return null;
}
function validateSkill(skillPath, content, mode = "create") {
  const errors = [];
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") {
    return { valid: false, errors: ["missing opening frontmatter delimiter '---'"] };
  }
  let closingLineIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      closingLineIndex = i;
      break;
    }
  }
  if (closingLineIndex === -1) {
    return { valid: false, errors: ["missing closing frontmatter delimiter '---'"] };
  }
  const frontmatterLines = lines.slice(1, closingLineIndex);
  const bodyLines = lines.slice(closingLineIndex + 1);
  const body = bodyLines.join("\n").trim();
  const parsed = parseFrontmatter(frontmatterLines);
  if (parsed === null) {
    return { valid: false, errors: ["frontmatter must parse to an object, not a scalar or array"] };
  }
  const name = parsed.name;
  if (typeof name !== "string" || name.trim() === "") {
    return { valid: false, errors: ["frontmatter 'name' is required and must be a non-empty string"] };
  }
  const description = parsed.description;
  if (typeof description !== "string" || description.trim() === "") {
    return { valid: false, errors: ["frontmatter 'description' is required and must be a non-empty string"] };
  }
  if (body === "") {
    return { valid: false, errors: ["skill body must be non-empty after frontmatter"] };
  }
  const trimmedName = name.trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(trimmedName)) {
    errors.push(
      "name must match convention: start with alphanumeric, followed by alphanumeric, dots, underscores, or hyphens"
    );
  }
  if (trimmedName.length > 64) {
    errors.push("name must be 64 characters or fewer");
  }
  const dirName = path6.basename(path6.dirname(skillPath));
  if (trimmedName !== dirName) {
    errors.push("name must match the parent directory name");
  }
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  if (mode === "create") {
    const skillsDir = path6.join(os3.homedir(), ".claude", "skills");
    const normalizedTarget = path6.normalize(skillPath);
    const existingSkills = findSkillFiles(skillsDir);
    for (const existingPath of existingSkills) {
      const normalizedExisting = path6.normalize(existingPath);
      if (normalizedExisting === normalizedTarget) {
        continue;
      }
      const existingName = extractNameFromFile(existingPath);
      if (existingName === trimmedName) {
        return {
          valid: false,
          errors: [`collision: skill with name '${trimmedName}' already exists at '${existingPath}'`]
        };
      }
    }
  }
  return { valid: true, errors: [] };
}
function parseValidateSkillArgs(argv) {
  const args = { path: "", content: "", mode: "create" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--path" && argv[i + 1]) {
      args.path = argv[++i];
    } else if (argv[i] === "--content" && argv[i + 1]) {
      args.content = argv[++i];
    } else if (argv[i] === "--mode" && argv[i + 1]) {
      args.mode = argv[++i];
    }
  }
  return args;
}
function handleValidateSkill(args) {
  return validateSkill(args.path, args.content, args.mode);
}

// src/commands/review-context.ts
import fs8 from "node:fs";
import path7 from "node:path";
import os4 from "node:os";

// src/lib/transcript.ts
import fs7 from "node:fs";
function parseTranscript(transcriptPath) {
  const summary = {
    toolCalls: [],
    userMessages: [],
    assistantMessages: [],
    totalTurns: 0
  };
  if (!transcriptPath) {
    process.stderr.write("[self-evolution] parseTranscript: transcript path is empty\n");
    return summary;
  }
  let raw;
  try {
    raw = fs7.readFileSync(transcriptPath, "utf-8").trim();
  } catch (err) {
    process.stderr.write(`[self-evolution] parseTranscript: failed to read "${transcriptPath}": ${err}
`);
    return summary;
  }
  if (!raw) return summary;
  let entries;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      entries = parsed;
    } else {
      entries = [parsed];
    }
  } catch {
    try {
      entries = raw.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
    } catch {
      return summary;
    }
  }
  for (const entry of entries) {
    const e = entry;
    const type = e.type;
    const message = e.message;
    if (type === "user" && message) {
      if (e.isMeta) continue;
      const content = message.content;
      if (typeof content === "string") {
        summary.userMessages.push(content);
        summary.totalTurns++;
      } else if (Array.isArray(content)) {
        let added = false;
        for (const block of content) {
          if (typeof block === "object" && block !== null) {
            const b = block;
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
            const b = block;
            if (b.type === "text" && typeof b.text === "string") {
              summary.assistantMessages.push(b.text);
              added = true;
            } else if (b.type === "tool_use") {
              const toolCall = {
                tool: String(b.name ?? "unknown"),
                input: b.input ?? {}
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
        summary.userMessages.push(e.content);
      } else if (e.role === "assistant" && typeof e.content === "string") {
        summary.assistantMessages.push(e.content);
      } else if (e.role === "tool_use" || e.role === "tool") {
        const toolCall = {
          tool: String(e.name ?? e.tool_name ?? "unknown"),
          input: e.input ?? e.tool_input ?? {}
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

// src/commands/review-context.ts
function handleReviewContext(options, logger) {
  const skillsDir = options.skillsDir ?? path7.join(os4.homedir(), ".claude", "skills");
  const transcript = parseTranscript(options.transcriptPath);
  let existingSkills = [];
  try {
    const entries = fs8.readdirSync(skillsDir, { withFileTypes: true });
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
import fs9 from "node:fs";
import path8 from "node:path";
import os5 from "node:os";
function handleLogDecision(sessionsDir, statsPath, sessionId, decision, detail, durationMs, logger) {
  logger.logDecision(decision, detail, durationMs);
  const skillName = decision !== "SKIPPED" ? extractSkillName(detail) : void 0;
  if (decision === "CREATED" || decision === "UPDATED" || decision === "SKIPPED" || decision === "DELETED") {
    logger.info("review_summary", {
      action: decision,
      ...skillName ? { name: skillName } : {},
      rationale: detail
    });
  }
  if (decision === "CREATED" || decision === "UPDATED" || decision === "SKIPPED" || decision === "DELETED") {
    updateStats(statsPath, decision, detail, sessionId, skillName);
    updateSessionResult(sessionsDir, sessionId, {
      review_decision: decision,
      review_detail: detail,
      ...skillName ? { skill_name: skillName } : {}
    });
    if (skillName) {
      const skillPath = path8.join(os5.homedir(), ".claude", "skills", skillName, "SKILL.md");
      try {
        const stat = fs9.statSync(skillPath);
        logger.info("skill_written", { path: skillPath, size_bytes: stat.size });
        const content = fs9.readFileSync(skillPath, "utf-8");
        logger.debug("skill_content_preview", { preview: content.slice(0, 200) });
      } catch {
        logger.info("skill_written", { skill_name: skillName });
      }
    }
  }
}
function extractSkillName(detail) {
  const match = detail.match(/skill[_\s-]?name[:\s=]+(\S+)/i);
  return match ? match[1] : void 0;
}

// src/commands/status.ts
import fs10 from "node:fs";
function handleStatus(statePath, statsPath) {
  const state = loadState(statePath);
  let stats = null;
  let latestReview = null;
  if (fs10.existsSync(statsPath)) {
    stats = loadStats(statsPath);
    if (stats.recent_decisions && stats.recent_decisions.length > 0) {
      const latest = stats.recent_decisions[0];
      latestReview = {
        action: latest.decision,
        ...latest.skill_name ? { name: latest.skill_name } : {},
        rationale: latest.detail,
        timestamp: latest.ts
      };
    }
  }
  return {
    active: {
      sessions: state.sessions,
      jobs: state.jobs
    },
    stats,
    latest_review: latestReview
  };
}

// src/commands/verify-skill.ts
function verifySkill(skillPath, content) {
  const errors = [];
  const scanResult = scanWrite(skillPath, content);
  if (!scanResult.allowed) {
    errors.push(`security: ${scanResult.reason}`);
  }
  const validationResult = validateSkill(skillPath, content);
  if (!validationResult.valid) {
    errors.push(...validationResult.errors);
  }
  return {
    verified: errors.length === 0,
    errors
  };
}
function parseVerifySkillArgs(argv) {
  const args = { path: "", content: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--path" && argv[i + 1]) {
      args.path = argv[++i];
    } else if (argv[i] === "--content" && argv[i + 1]) {
      args.content = argv[++i];
    }
  }
  return args;
}
function handleVerifySkill(path12, content) {
  return verifySkill(path12, content);
}

// src/commands/delete-skill.ts
import fs11 from "node:fs";
import path9 from "node:path";
import os6 from "node:os";
var VALID_SKILL_NAME = /^[a-z0-9][a-z0-9._-]*$/;
function handleDeleteSkill(args) {
  if (!args.name) {
    return { success: false, message: "missing skill name" };
  }
  if (args.name.includes("/") || !VALID_SKILL_NAME.test(args.name)) {
    return { success: false, message: `invalid skill name: '${args.name}'` };
  }
  const skillDir = path9.join(os6.homedir(), ".claude", "skills", args.name);
  const normalizedSkillDir = path9.normalize(skillDir);
  const normalizedSkillsDir = path9.normalize(path9.join(os6.homedir(), ".claude", "skills"));
  if (!normalizedSkillDir.startsWith(normalizedSkillsDir + path9.sep) && normalizedSkillDir !== normalizedSkillsDir) {
    return { success: false, message: `invalid skill name: '${args.name}' (path traversal blocked)` };
  }
  if (!fs11.existsSync(skillDir)) {
    return { success: false, message: `skill '${args.name}' not found` };
  }
  try {
    fs11.rmSync(skillDir, { recursive: true, force: true });
    return { success: true, message: `skill '${args.name}' deleted` };
  } catch (err) {
    return { success: false, message: `failed to delete skill '${args.name}': ${err}` };
  }
}
function parseDeleteSkillArgs(argv) {
  const args = { name: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--name" && argv[i + 1]) {
      args.name = argv[++i];
    }
  }
  return args;
}

// src/commands/config-get.ts
function parseConfigGetArgs(argv) {
  const args = { key: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--key" && argv[i + 1]) {
      args.key = argv[++i];
    }
  }
  return args;
}
function getConfigValue(resolved, key) {
  return resolved[key];
}
function handleConfigGet(pluginRoot, filterKey) {
  const resolved = resolveConfig(pluginRoot);
  const raw = loadRawConfig(pluginRoot);
  const validKeys = filterKey ? CONFIG_SCHEMA[filterKey] ? [filterKey] : [] : Object.keys(CONFIG_SCHEMA);
  return validKeys.map((key) => {
    const envVar = getEnvVarName(key);
    let source = "default";
    let env_var;
    if (envVar && process.env[envVar]) {
      source = "env_var";
      env_var = envVar;
    } else if (key in raw) {
      source = "config_file";
    }
    return { key, value: getConfigValue(resolved, key), source, env_var };
  });
}

// src/commands/config-set.ts
import fs12 from "node:fs";
import path10 from "node:path";
function parseConfigSetArgs(argv) {
  const args = { key: "", value: "", reset: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--key" && argv[i + 1]) {
      args.key = argv[++i];
    } else if (argv[i] === "--value" && argv[i + 1]) {
      args.value = argv[++i];
    } else if (argv[i] === "--reset") {
      args.reset = true;
    }
  }
  return args;
}
function getConfigValue2(resolved, key) {
  return resolved[key];
}
function handleConfigSet(pluginRoot, key, rawValue, reset = false) {
  if (!CONFIG_SCHEMA[key]) {
    return { ok: false, key, error: `unknown key '${key}'. Valid keys: ${Object.keys(CONFIG_SCHEMA).join(", ")}`, errorCode: 1 };
  }
  const resolved = resolveConfig(pluginRoot);
  const old_value = getConfigValue2(resolved, key);
  const envVar = getEnvVarName(key);
  const hasEnvOverride = envVar && process.env[envVar];
  if (reset) {
    const raw2 = loadRawConfig(pluginRoot);
    delete raw2[key];
    const configPath2 = path10.join(pluginRoot, "config.json");
    try {
      fs12.writeFileSync(configPath2, JSON.stringify(raw2, null, 2) + "\n");
    } catch (err) {
      return { ok: false, key, error: `failed to write config.json: ${err}`, errorCode: 2 };
    }
    const defaults = loadConfig(pluginRoot);
    const new_value = getConfigValue2(defaults, key);
    const source2 = hasEnvOverride ? "env_var" : "default";
    const result2 = { ok: true, key, old_value, new_value, source: source2 };
    if (hasEnvOverride && envVar) result2.env_var = envVar;
    return result2;
  }
  const validation = validateConfigValue(key, rawValue);
  if (!validation.ok) {
    return { ok: false, key, error: validation.error, errorCode: 1 };
  }
  const raw = loadRawConfig(pluginRoot);
  raw[key] = validation.value;
  const configPath = path10.join(pluginRoot, "config.json");
  try {
    fs12.writeFileSync(configPath, JSON.stringify(raw, null, 2) + "\n");
  } catch (err) {
    return { ok: false, key, error: `failed to write config.json: ${err}`, errorCode: 2 };
  }
  const source = hasEnvOverride ? "env_var" : "config_file";
  const result = { ok: true, key, old_value, new_value: validation.value, source };
  if (hasEnvOverride && envVar) result.env_var = envVar;
  return result;
}

// src/runtime.ts
function resolvePaths() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? "";
  const pluginData = process.env.CLAUDE_PLUGIN_DATA ?? (() => {
    if (pluginRoot) {
      const name = path11.basename(pluginRoot);
      const marketplace = path11.basename(path11.dirname(pluginRoot));
      return path11.join(os7.homedir(), ".claude", "plugins", "data", `${name}-${marketplace}`);
    }
    return path11.join(os7.homedir(), ".claude", "plugins", "data", "self-evolution-self-evolution-marketplace");
  })();
  const config = resolveConfig(pluginRoot);
  return {
    statePath: path11.join(pluginData, "state.json"),
    sessionsDir: path11.join(pluginData, "sessions"),
    statsPath: path11.join(pluginData, "stats.json"),
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
        handleSessionStart(sessionsDir, sessionId, logger);
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
          reviewMaxTurns: config.review_max_turns,
          platform: config.platform
        }, logger);
        return 0;
      }
      case "security-scan": {
        const scanArgs = parseSecurityScanArgs(args);
        if (!scanArgs.scanDir && (!scanArgs.path || !scanArgs.content)) {
          process.stdout.write(JSON.stringify({ allowed: false, reason: "missing --path/--content or --scan-dir" }) + "\n");
          return 1;
        }
        scanArgs.maxSkillSize = scanArgs.maxSkillSize ?? config.max_skill_file_size;
        scanArgs.maxFiles = scanArgs.maxFiles ?? config.max_files_per_skill;
        scanArgs.maxFileSize = scanArgs.maxFileSize ?? config.max_skill_file_size;
        scanArgs.maxTotalSize = scanArgs.maxTotalSize ?? config.max_skill_total_size;
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
        if (!transcriptPath) {
          logger.info("review_context_missing_transcript_path", { has_arg: !!args[0], has_env: !!process.env.SELF_EVOLUTION_TRANSCRIPT_PATH });
        }
        const result = handleReviewContext({ transcriptPath, sessionId }, logger);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return 0;
      }
      case "log-decision": {
        const decision = args[0] || "unknown";
        const detail = args[1] || "";
        const durationMs = parseInt(args[2] || "0", 10);
        const sessionId = args[3] || (process.env.SELF_EVOLUTION_SESSION_ID ?? "unknown");
        const logger = createLogger(sessionsDir, sessionId, logLevel);
        handleLogDecision(sessionsDir, statsPath, sessionId, decision, detail, durationMs, logger);
        return 0;
      }
      case "status": {
        const result = handleStatus(statePath, statsPath);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return 0;
      }
      case "validate-skill": {
        const validateArgs = parseValidateSkillArgs(args);
        if (!validateArgs.path || !validateArgs.content) {
          process.stdout.write(JSON.stringify({ valid: false, errors: ["missing --path or --content"] }) + "\n");
          return 1;
        }
        const result = handleValidateSkill(validateArgs);
        process.stdout.write(JSON.stringify(result) + "\n");
        return result.valid ? 0 : 1;
      }
      case "verify-skill": {
        const vArgs = parseVerifySkillArgs(args);
        if (!vArgs.path || !vArgs.content) {
          process.stdout.write(JSON.stringify({ verified: false, errors: ["missing --path or --content"] }) + "\n");
          return 1;
        }
        const result = handleVerifySkill(vArgs.path, vArgs.content);
        process.stdout.write(JSON.stringify(result) + "\n");
        return 0;
      }
      case "delete-skill": {
        const delArgs = parseDeleteSkillArgs(args);
        if (!delArgs.name) {
          process.stdout.write(JSON.stringify({ success: false, message: "missing --name" }) + "\n");
          return 1;
        }
        const result = handleDeleteSkill(delArgs);
        process.stdout.write(JSON.stringify(result) + "\n");
        return result.success ? 0 : 1;
      }
      case "config-get": {
        const getArgs = parseConfigGetArgs(args);
        const result = handleConfigGet(pluginRoot, getArgs.key || void 0);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return 0;
      }
      case "config-set": {
        const setArgs = parseConfigSetArgs(args);
        if (!setArgs.key) {
          process.stdout.write(JSON.stringify({ ok: false, key: "", error: "missing --key" }) + "\n");
          return 1;
        }
        if (!setArgs.reset && !setArgs.value) {
          process.stdout.write(JSON.stringify({ ok: false, key: setArgs.key, error: "missing --value (or use --reset)" }) + "\n");
          return 1;
        }
        const result = handleConfigSet(pluginRoot, setArgs.key, setArgs.value, setArgs.reset);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return result.ok ? 0 : result.errorCode ?? 1;
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
      stdinData = fs13.readFileSync("/dev/stdin", "utf-8").trim();
    } catch {
    }
  }
  const exitCode = runCommand(command, args, stdinData);
  process.exit(exitCode);
}
export {
  runCommand
};
