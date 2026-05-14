import type { Logger } from "../lib/logger.js";
import { updateStats, updateSessionResult } from "../lib/state.js";

export function handleLogDecision(
  sessionsDir: string,
  statsPath: string,
  sessionId: string,
  decision: string,
  detail: string,
  logger: Logger
): void {
  logger.logDecision(decision, detail, 0);

  if (decision === "CREATED" || decision === "UPDATED" || decision === "SKIPPED") {
    const skillName = decision !== "SKIPPED" ? extractSkillName(detail) : undefined;
    updateStats(statsPath, decision as "CREATED" | "UPDATED" | "SKIPPED", detail, sessionId, skillName);
    updateSessionResult(sessionsDir, sessionId, {
      review_decision: decision as "CREATED" | "UPDATED" | "SKIPPED",
      review_detail: detail,
      ...(skillName ? { skill_name: skillName } : {}),
    });
    if (skillName) {
      logger.info("skill_written", { skill_name: skillName });
    }
  }
}

function extractSkillName(detail: string): string | undefined {
  const match = detail.match(/skill[_\s-]?name[:\s=]+(\S+)/i);
  return match ? match[1] : undefined;
}
