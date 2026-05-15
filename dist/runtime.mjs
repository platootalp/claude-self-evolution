// self-evolution runtime — auto-generated bundle


// src/runtime.ts
import fs10 from "node:fs";
import path8 from "node:path";
import os4 from "node:os";

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
  return template.replace(/\${SELF_EVOLUTION_SESSION_ID}/g, opts.sessionId).replace(/\${CLAUDE_PLUGIN_ROOT}/g, opts.pluginRoot).replace(/\${CLAUDE_PLUGIN_DATA}/g, opts.pluginData).replace(/\${SELF_EVOLUTION_TRANSCRIPT_PATH}/g, opts.transcriptPath);
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
import os from "node:os";
import fs5 from "node:fs";
var SKILLS_DIR = path5.join(os.homedir(), ".claude", "skills");
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
  { id: "unicode-grapheme-joiner", severity: "caution", category: "unicode", pattern: /͏/, description: "Combining grapheme joiner" }
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
function scanWrite(targetPath, content, options = {}) {
  const maxSkillSize = options.maxSkillSize ?? 262144;
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
  const dangerousMatches = allMatches.filter((m) => m.severity === "dangerous");
  const cautionMatches = allMatches.filter((m) => m.severity === "caution");
  if (dangerousMatches.length > 0) {
    const categories = [...new Set(dangerousMatches.map((m) => m.category))];
    const isBase64 = dangerousMatches.some((m) => m.id.includes("__base64"));
    const reason = isBase64 ? `${categories.join(", ")} pattern (base64-decoded)` : `${categories.join(", ")} pattern`;
    return { allowed: false, reason, matches: allMatches };
  }
  const size = Buffer.byteLength(content, "utf-8");
  if (size > maxSkillSize) {
    return { allowed: false, reason: `file too large (${size} > ${maxSkillSize} bytes)` };
  }
  if (cautionMatches.length > 0) {
    const categories = [...new Set(cautionMatches.map((m) => m.category))];
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
      maxSkillSize: args.maxSkillSize
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
    }
  }
  return args;
}

// src/commands/review-context.ts
import fs7 from "node:fs";
import path6 from "node:path";
import os2 from "node:os";

// src/lib/transcript.ts
import fs6 from "node:fs";
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
    raw = fs6.readFileSync(transcriptPath, "utf-8").trim();
  } catch (err) {
    process.stderr.write(`[self-evolution] parseTranscript: failed to read "${transcriptPath}": ${err}
`);
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
    const entries = fs7.readdirSync(skillsDir, { withFileTypes: true });
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
import fs8 from "node:fs";
import path7 from "node:path";
import os3 from "node:os";
function handleLogDecision(sessionsDir, statsPath, sessionId, decision, detail, durationMs, logger) {
  logger.logDecision(decision, detail, durationMs);
  if (decision === "CREATED" || decision === "UPDATED" || decision === "SKIPPED") {
    const skillName = decision !== "SKIPPED" ? extractSkillName(detail) : void 0;
    updateStats(statsPath, decision, detail, sessionId, skillName);
    updateSessionResult(sessionsDir, sessionId, {
      review_decision: decision,
      review_detail: detail,
      ...skillName ? { skill_name: skillName } : {}
    });
    if (skillName) {
      const skillPath = path7.join(os3.homedir(), ".claude", "skills", skillName, "SKILL.md");
      try {
        const stat = fs8.statSync(skillPath);
        logger.info("skill_written", { path: skillPath, size_bytes: stat.size });
        const content = fs8.readFileSync(skillPath, "utf-8");
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
import fs9 from "node:fs";
function handleStatus(statePath, statsPath) {
  const state = loadState(statePath);
  let stats = null;
  if (fs9.existsSync(statsPath)) {
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
      const name = path8.basename(pluginRoot);
      const marketplace = path8.basename(path8.dirname(pluginRoot));
      return path8.join(os4.homedir(), ".claude", "plugins", "data", `${name}-${marketplace}`);
    }
    return path8.join(os4.homedir(), ".claude", "plugins", "data", "self-evolution-self-evolution-marketplace");
  })();
  const config = resolveConfig(pluginRoot);
  return {
    statePath: path8.join(pluginData, "state.json"),
    sessionsDir: path8.join(pluginData, "sessions"),
    statsPath: path8.join(pluginData, "stats.json"),
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
      stdinData = fs10.readFileSync("/dev/stdin", "utf-8").trim();
    } catch {
    }
  }
  const exitCode = runCommand(command, args, stdinData);
  process.exit(exitCode);
}
export {
  runCommand
};
