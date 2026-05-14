import path from "node:path";
import os from "node:os";
import { handleSessionStart } from "./commands/session-start.js";
import { handlePostToolUse } from "./commands/post-tool-use.js";
import { handleStopGate } from "./commands/stop-gate.js";
import { handleSecurityScan, parseSecurityScanArgs } from "./commands/security-scan.js";
import { handleReviewContext } from "./commands/review-context.js";
import { handleLogDecision } from "./commands/log-decision.js";
import { handleStatus } from "./commands/status.js";

function resolvePaths(): { statePath: string; logPath: string; pluginRoot: string; pluginData: string } {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? "";
  const pluginData = process.env.CLAUDE_PLUGIN_DATA ?? (() => {
    if (pluginRoot) {
      const name = path.basename(pluginRoot);
      const marketplace = path.basename(path.dirname(pluginRoot));
      return path.join(os.homedir(), ".claude", "plugins", "data", `${name}-${marketplace}`);
    }
    return path.join(os.homedir(), ".claude", "plugins", "data", "self-evolution-self-evolution-marketplace");
  })();
  return {
    statePath: path.join(pluginData, "state.json"),
    logPath: path.join(process.env.SELF_EVOLUTION_LOG_DIR ?? path.join(os.homedir(), ".claude", "logs"), "self-evolution.jsonl"),
    pluginRoot,
    pluginData,
  };
}

function getNudgeInterval(): number {
  const env = process.env.SELF_EVOLUTION_NUDGE_INTERVAL;
  if (env) return parseInt(env, 10);
  const opt = process.env.CLAUDE_PLUGIN_OPTION_nudge_interval;
  if (opt) return parseInt(opt, 10);
  return 10;
}

function getMaxSkillSize(): number {
  const env = process.env.SELF_EVOLUTION_MAX_SKILL_SIZE;
  if (env) return parseInt(env, 10);
  const opt = process.env.CLAUDE_PLUGIN_OPTION_max_skill_size_kb;
  if (opt) return parseInt(opt, 10);
  return 15360;
}

export function runCommand(command: string, args: string[], stdinData: string): number {
  const paths = resolvePaths();

  try {
    switch (command) {
      case "session-start":
        handleSessionStart(paths.logPath, {
          CLAUDE_PLUGIN_ROOT: process.env.CLAUDE_PLUGIN_ROOT ?? "",
          CLAUDE_PLUGIN_DATA: process.env.CLAUDE_PLUGIN_DATA ?? "",
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
          platform: process.env.CLAUDE_PLUGIN_OPTION_platform,
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
      const { readFileSync } = await import("node:fs");
      stdinData = readFileSync("/dev/stdin", "utf-8").trim();
    } catch {}
  }

  const exitCode = runCommand(command, args, stdinData);
  process.exit(exitCode);
}
