import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { handleSessionStart } from "./commands/session-start.js";
import { handlePostToolUse } from "./commands/post-tool-use.js";
import { handleStopGate } from "./commands/stop-gate.js";
import { handleSecurityScan, parseSecurityScanArgs } from "./commands/security-scan.js";
import { handleReviewContext } from "./commands/review-context.js";
import { handleLogDecision } from "./commands/log-decision.js";
import { handleStatus } from "./commands/status.js";

interface Config {
  nudge_interval: number;
  max_skill_size: number;
  review_model: string;
  platform: string;
  category_whitelist: string[];
  meta_skill_name: string;
}

const DEFAULT_CONFIG: Config = {
  nudge_interval: 10,
  max_skill_size: 15360,
  review_model: "sonnet",
  platform: "auto",
  category_whitelist: ["debug", "refactor", "test", "deploy", "data", "web", "cli", "meta"],
  meta_skill_name: "evolve-skill-writer",
};

function loadConfig(pluginRoot: string): Config {
  // 1. Try user override: <pluginRoot>/config.json
  // 2. Fallback: <pluginRoot>/config.default.json
  // 3. Fallback: hardcoded defaults
  for (const name of ["config.json", "config.default.json"]) {
    try {
      const raw = fs.readFileSync(path.join(pluginRoot, name), "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {}
  }
  return { ...DEFAULT_CONFIG };
}

function resolvePaths(): { statePath: string; logPath: string; pluginRoot: string; pluginData: string; config: Config } {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? "";
  const pluginData = process.env.CLAUDE_PLUGIN_DATA ?? (() => {
    if (pluginRoot) {
      const name = path.basename(pluginRoot);
      const marketplace = path.basename(path.dirname(pluginRoot));
      return path.join(os.homedir(), ".claude", "plugins", "data", `${name}-${marketplace}`);
    }
    return path.join(os.homedir(), ".claude", "plugins", "data", "self-evolution-self-evolution-marketplace");
  })();
  const config = loadConfig(pluginRoot);

  // Environment variables override config file
  if (process.env.SELF_EVOLUTION_NUDGE_INTERVAL) config.nudge_interval = parseInt(process.env.SELF_EVOLUTION_NUDGE_INTERVAL, 10);
  if (process.env.SELF_EVOLUTION_MAX_SKILL_SIZE) config.max_skill_size = parseInt(process.env.SELF_EVOLUTION_MAX_SKILL_SIZE, 10);
  if (process.env.SELF_EVOLUTION_REVIEW_MODEL) config.review_model = process.env.SELF_EVOLUTION_REVIEW_MODEL;
  if (process.env.SELF_EVOLUTION_PLATFORM) config.platform = process.env.SELF_EVOLUTION_PLATFORM;

  return {
    statePath: path.join(pluginData, "state.json"),
    logPath: path.join(process.env.SELF_EVOLUTION_LOG_DIR ?? path.join(os.homedir(), ".claude", "logs"), "self-evolution.jsonl"),
    pluginRoot,
    pluginData,
    config,
  };
}

export function runCommand(command: string, args: string[], stdinData: string): number {
  const { statePath, logPath, pluginRoot, pluginData, config } = resolvePaths();

  try {
    switch (command) {
      case "session-start":
        handleSessionStart(logPath, {
          CLAUDE_PLUGIN_ROOT: process.env.CLAUDE_PLUGIN_ROOT ?? "",
          CLAUDE_PLUGIN_DATA: process.env.CLAUDE_PLUGIN_DATA ?? "",
        });
        return 0;

      case "post-tool-use": {
        if (!stdinData) return 0;
        const input = JSON.parse(stdinData);
        handlePostToolUse(statePath, input, config.nudge_interval);
        return 0;
      }

      case "stop-gate": {
        if (!stdinData) return 0;
        const input = JSON.parse(stdinData);
        handleStopGate(statePath, input, {
          pluginRoot,
          pluginData,
          reviewModel: config.review_model,
          platform: config.platform,
        });
        return 0;
      }

      case "security-scan": {
        const scanArgs = parseSecurityScanArgs(args);
        if (!scanArgs.path || !scanArgs.content) {
          process.stdout.write(JSON.stringify({ allowed: false, reason: "missing --path or --content" }) + "\n");
          return 1;
        }
        scanArgs.maxSkillSize = scanArgs.maxSkillSize ?? config.max_skill_size;
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
        handleLogDecision(logPath, decision, detail, sessionId);
        return 0;
      }

      case "status": {
        const result = handleStatus(statePath);
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
