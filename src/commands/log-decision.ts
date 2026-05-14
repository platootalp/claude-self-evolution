import { logDecision } from "../lib/logger.js";

export function handleLogDecision(
  logPath: string,
  decision: string,
  detail: string,
  sessionId: string = ""
): void {
  logDecision(logPath, decision, detail, 0, sessionId);
}
