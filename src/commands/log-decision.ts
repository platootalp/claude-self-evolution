import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Logger } from "../lib/logger.js";
import { updateStats, updateSessionResult } from "../lib/state.js";

export function handleLogDecision(
  sessionsDir: string,
  statsPath: string,
  sessionId: string,
  decision: string,
  detail: string,
  durationMs: number,
  logger: Logger
): void {
  logger.logDecision(decision, detail, durationMs);

  const skillName = decision !== "SKIPPED" ? extractSkillName(detail) : undefined;

  // Log review summary event
  if (decision === "CREATED" || decision === "UPDATED" || decision === "SKIPPED") {
    logger.info("review_summary", {
      action: decision,
      ...(skillName ? { name: skillName } : {}),
      rationale: detail,
    });
  }

  if (decision === "CREATED" || decision === "UPDATED" || decision === "SKIPPED") {
    updateStats(statsPath, decision as "CREATED" | "UPDATED" | "SKIPPED", detail, sessionId, skillName);
    updateSessionResult(sessionsDir, sessionId, {
      review_decision: decision as "CREATED" | "UPDATED" | "SKIPPED",
      review_detail: detail,
      ...(skillName ? { skill_name: skillName } : {}),
    });
    if (skillName) {
      const skillPath = path.join(os.homedir(), ".claude", "skills", skillName, "SKILL.md");
      try {
        const stat = fs.statSync(skillPath);
        logger.info("skill_written", { path: skillPath, size_bytes: stat.size });
        const content = fs.readFileSync(skillPath, "utf-8");
        logger.debug("skill_content_preview", { preview: content.slice(0, 200) });
      } catch {
        logger.info("skill_written", { skill_name: skillName });
      }
    }
  }
}

function extractSkillName(detail: string): string | undefined {
  const match = detail.match(/skill[_\s-]?name[:\s=]+(\S+)/i);
  return match ? match[1] : undefined;
}
