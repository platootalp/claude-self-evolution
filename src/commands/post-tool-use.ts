import { incrementCount } from "../lib/state.js";
import type { PostToolUseInput } from "../types.js";

export function handlePostToolUse(
  statePath: string,
  input: PostToolUseInput,
  threshold: number = 10
): void {
  if (!input.session_id) return;
  incrementCount(statePath, input.session_id, threshold);
}
