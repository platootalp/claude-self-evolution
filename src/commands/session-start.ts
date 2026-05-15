import type { Logger } from "../lib/logger.js";
import { initSessionState } from "../lib/state.js";

export function handleSessionStart(
  sessionsDir: string,
  sessionId: string,
  logger: Logger
): void {
  initSessionState(sessionsDir, sessionId);
  logger.info("hook_triggered", { hook: "session_start" });
  logger.debug("counter_state", { count: 0, pending_review: false });
}
