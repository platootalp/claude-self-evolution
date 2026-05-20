import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import type { PlatformAdapter, PlatformName, SpawnOptions } from "../../types.js";
import type { ChildProcess } from "node:child_process";

export class ClaudeCodeAdapter implements PlatformAdapter {
  readonly platform: PlatformName = "claude-code";
  readonly pluginManifestDir = ".claude-plugin";
  readonly skillDirs = [path.join(os.homedir(), ".claude", "skills")];
  readonly envPluginRoot = "CLAUDE_PLUGIN_ROOT";
  readonly envPluginData = "CLAUDE_PLUGIN_DATA";
  readonly envSessionId = "SELF_EVOLUTION_SESSION_ID";
  readonly companionCommand = "claude";
  readonly hookFile = "hooks/hooks.json";
  readonly transcriptFormat = "json-array";

  companionFlags(opts: SpawnOptions): string[] {
    const flags = [
      "-p", "",
      "--allowedTools", "Read,Write,Bash,Glob,Grep,Skill",
      "--max-turns", String(opts.reviewMaxTurns ?? 8),
      "--output-format", "json",
    ];
    if (opts.reviewModel) {
      flags.push("--model", opts.reviewModel);
    }
    return flags;
  }

  spawnCompanion(prompt: string, opts: SpawnOptions, logFd?: number): ChildProcess {
    const flags = this.companionFlags(opts);
    flags[1] = prompt;
    const child = spawn(this.companionCommand, flags, {
      detached: true,
      stdio: ["ignore", logFd ?? "ignore", logFd ?? "ignore"],
      env: {
        ...process.env,
        ...this.getCompanionEnv(opts),
      },
    });
    child.unref();
    return child;
  }

  getCompanionEnv(opts: SpawnOptions): Record<string, string> {
    return {
      CLAUDE_PLUGIN_ROOT: opts.pluginRoot,
      CLAUDE_PLUGIN_DATA: opts.pluginData,
      SELF_EVOLUTION_SESSION_ID: opts.sessionId,
      SELF_EVOLUTION_TRANSCRIPT_PATH: opts.transcriptPath,
      SELF_EVOLUTION_REVIEW_MODE: "1",
    };
  }

  resolvePluginRoot(): string {
    return process.env.CLAUDE_PLUGIN_ROOT ?? "";
  }

  resolvePluginData(pluginRoot: string): string {
    if (process.env.CLAUDE_PLUGIN_DATA) return process.env.CLAUDE_PLUGIN_DATA;
    if (pluginRoot) {
      const name = path.basename(pluginRoot);
      const marketplace = path.basename(path.dirname(pluginRoot));
      return path.join(os.homedir(), ".claude", "plugins", "data", `${name}-${marketplace}`);
    }
    return path.join(os.homedir(), ".claude", "plugins", "data", "self-evolution-self-evolution-marketplace");
  }
}
