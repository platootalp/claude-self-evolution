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
import { handleValidateSkill, parseValidateSkillArgs } from "./commands/validate-skill.js";
import { handleReviewContext } from "./commands/review-context.js";
import { handleLogDecision } from "./commands/log-decision.js";
import { handleStatus } from "./commands/status.js";
import { handleVerifySkill, parseVerifySkillArgs } from "./commands/verify-skill.js";
import { handleDeleteSkill, parseDeleteSkillArgs } from "./commands/delete-skill.js";
import { handleConfigGet, parseConfigGetArgs } from "./commands/config-get.js";
import { handleConfigSet, parseConfigSetArgs } from "./commands/config-set.js";
import { getAdapter, normalizeHookInput } from "./lib/adapter.js";

function resolvePaths(): { statePath: string; sessionsDir: string; statsPath: string; pluginRoot: string; pluginData: string; config: Config } {
  const adapter = getAdapter();
  const pluginRoot = adapter.resolvePluginRoot();
  const pluginData = adapter.resolvePluginData(pluginRoot);
  const config = resolveConfig(pluginRoot, pluginData);

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
        let sessionId: string;
        if (stdinData) {
          try {
            const raw = JSON.parse(stdinData);
            const input = normalizeHookInput(raw, getAdapter().platform);
            sessionId = input.sessionId || process.env.SELF_EVOLUTION_SESSION_ID || `session-${Date.now()}`;
          } catch {
            sessionId = process.env.SELF_EVOLUTION_SESSION_ID ?? `session-${Date.now()}`;
          }
        } else {
          sessionId = process.env.SELF_EVOLUTION_SESSION_ID ?? `session-${Date.now()}`;
        }
        const logger = createLogger(sessionsDir, sessionId, logLevel);
        handleSessionStart(sessionsDir, sessionId, logger);
        return 0;
      }

      case "post-tool-use": {
        if (!stdinData) return 0;
        const raw = JSON.parse(stdinData);
        const input = normalizeHookInput(raw, getAdapter().platform);
        const sessionId = input.sessionId || process.env.SELF_EVOLUTION_SESSION_ID || `session-${Date.now()}`;
        const logger = createLogger(sessionsDir, sessionId, logLevel);
        handlePostToolUse(statePath, sessionsDir, raw, logger, config.nudge_interval);
        return 0;
      }

      case "stop-gate": {
        if (!stdinData) return 0;
        const raw = JSON.parse(stdinData);
        const input = normalizeHookInput(raw, getAdapter().platform);
        const sessionId = input.sessionId || process.env.SELF_EVOLUTION_SESSION_ID || `session-${Date.now()}`;
        const logger = createLogger(sessionsDir, sessionId, logLevel);
        handleStopGate(statePath, sessionsDir, sessionId, {
          session_id: sessionId,
          transcript_path: input.transcriptPath ?? "",
          stop_hook_active: (raw as Record<string, unknown>).stop_hook_active ?? (raw as Record<string, unknown>).stopHookActive ?? false,
        }, {
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
        const sessionId = process.env.SELF_EVOLUTION_SESSION_ID ?? `session-${Date.now()}`;
        const logger = createLogger(sessionsDir, sessionId, logLevel);
        const result = handleSecurityScan(scanArgs, logger);
        process.stdout.write(JSON.stringify(result) + "\n");
        return 0;
      }

      case "review-context": {
        const transcriptPath = args[0] || process.env.SELF_EVOLUTION_TRANSCRIPT_PATH || "";
        const sessionId = process.env.SELF_EVOLUTION_SESSION_ID ?? `session-${Date.now()}`;
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
        const sessionId = args[3] || (process.env.SELF_EVOLUTION_SESSION_ID ?? `session-${Date.now()}`);
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
        const result = handleConfigGet(pluginRoot, pluginData, getArgs.key || undefined);
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
        const result = handleConfigSet(pluginRoot, pluginData, setArgs.key, setArgs.value, setArgs.reset);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return result.ok ? 0 : (result.errorCode ?? 1);
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
