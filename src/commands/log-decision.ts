import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Logger } from "../lib/logger.js";
import { updateStats, updateSessionResult } from "../lib/state.js";

type ReviewDecision = "CREATED" | "UPDATED" | "SKIPPED" | "DELETED";
const VALID_DECISIONS: ReviewDecision[] = ["CREATED", "UPDATED", "SKIPPED", "DELETED"];

function isValidDecision(d: string): d is ReviewDecision {
  return VALID_DECISIONS.includes(d as ReviewDecision);
}

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

  if (!isValidDecision(decision)) return;

  const skillName = decision !== "SKIPPED" ? extractSkillName(detail) : undefined;

  logger.info("review_summary", {
    action: decision,
    ...(skillName ? { name: skillName } : {}),
    rationale: detail,
  });

  updateStats(statsPath, decision, detail, sessionId, skillName);
  updateSessionResult(sessionsDir, sessionId, {
    review_decision: decision,
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

function extractSkillName(detail: string): string | undefined {
  const match = detail.match(/skill[_\s-]?name[:\s=]+(\S+)/i);
  return match ? match[1] : undefined;
}
