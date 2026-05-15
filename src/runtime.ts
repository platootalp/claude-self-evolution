import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveConfig, resolveLogLevel } from "./lib/config.js";
import type { Config } from "./lib/config.js";
import { createLogger } from "./lib/logger.js";
import { handleSessionStart } from "./commands/session-start.js";
import { handlePostToolUse } from "./commands/post-tool-use.js";
import { handleStopGate } from "./commands/stop-gate.js";
import { handleSecurityScan, parseSecurityScanArgs } from "./commands/security-scan.js";
import { handleReviewContext } from "./commands/review-context.js";
import { handleLogDecision } from "./commands/log-decision.js";
import { handleStatus } from "./commands/status.js";

function resolvePaths(): { statePath: string; sessionsDir: string; statsPath: string; pluginRoot: string; pluginData: string; config: Config } {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? "";
  const pluginData = process.env.CLAUDE_PLUGIN_DATA ?? (() => {
    if (pluginRoot) {
      const name = path.basename(pluginRoot);
      const marketplace = path.basename(path.dirname(pluginRoot));
      return path.join(os.homedir(), ".claude", "plugins", "data", `${name}-${marketplace}`);
    }
    return path.join(os.homedir(), ".claude", "plugins", "data", "self-evolution-self-evolution-marketplace");
  })();
  const config = resolveConfig(pluginRoot);

  return {
    statePath: path.join(pluginData, "state.json"),
    sessionsDir: path.join(pluginData, "sessions"),
    statsPath: path.join(pluginData, "stats.json"),
    pluginRoot,
    pluginData,
    config,
  };
}

export function runCommand(command: string, args: string[], stdinData: string): number {
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
          platform: config.platform,
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
        process.stderr.write(`Unknown command: ${command}\n`);
        return 1;
    }
  } catch (err) {
    process.stderr.write(`Error: ${err}\n`);
    return 1;
  }
}

// CLI entry point
if (process.argv[1]?.endsWith("runtime.ts") || process.argv[1]?.endsWith("runtime.mjs")) {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  let stdinData = "";
  if (["post-tool-use", "stop-gate"].includes(command)) {
    try {
      stdinData = fs.readFileSync("/dev/stdin", "utf-8").trim();
    } catch {}
  }

  const exitCode = runCommand(command, args, stdinData);
  process.exit(exitCode);
}
