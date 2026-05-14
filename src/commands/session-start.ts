import type { Logger } from "../lib/logger.js";
import { initSessionState } from "../lib/state.js";

export function handleSessionStart(
  sessionsDir: string,
  sessionId: string,
  logger: Logger,
  env: Record<string, string>
): void {
  initSessionState(sessionsDir, sessionId);
  logger.info("hook_triggered", {
    event: "session_start",
    CLAUDE_PLUGIN_ROOT: env.CLAUDE_PLUGIN_ROOT ?? "EMPTY",
    CLAUDE_PLUGIN_DATA: env.CLAUDE_PLUGIN_DATA ?? "EMPTY",
  });
  logger.debug("counter_state", { count: 0, pending_review: false });
}
