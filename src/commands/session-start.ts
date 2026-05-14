import { logEvent } from "../lib/logger.js";

export function handleSessionStart(logPath: string, env: Record<string, string>): void {
  logEvent(logPath, "info", "diag_hook_fired", {
    CLAUDE_PLUGIN_ROOT: env.CLAUDE_PLUGIN_ROOT ?? "EMPTY",
    CLAUDE_PLUGIN_DATA: env.CLAUDE_PLUGIN_DATA ?? "EMPTY",
  });
}
