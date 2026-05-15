import { incrementCount, loadState, resetCount } from "../lib/state.js";
import type { PostToolUseInput } from "../types.js";
import type { Logger } from "../lib/logger.js";

export function handlePostToolUse(
  statePath: string,
  sessionsDir: string,
  input: PostToolUseInput,
  logger: Logger,
  threshold: number = 10
): number {
  if (!input.session_id) return 0;
  if (input.tool_name === "Skill") {
    resetCount(statePath, input.session_id);
    return 0;
  }
  if (process.env.SELF_EVOLUTION_REVIEW_MODE === "1") return 0;
  const stateBefore = loadState(statePath);
  const prevPending = stateBefore.sessions[input.session_id]?.pending_review ?? false;
  const newCount = incrementCount(statePath, input.session_id, threshold);
  const stateAfter = loadState(statePath);
  const nowPending = stateAfter.sessions[input.session_id]?.pending_review ?? false;
  logger.debug("counter_state", { count: newCount, pending_review: nowPending, session_id: input.session_id });
  if (!prevPending && nowPending) {
    logger.info("hook_triggered", { hook: "post_tool_use", pending: true, session_id: input.session_id });
  }
  return newCount;
}
