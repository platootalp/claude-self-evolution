import { consumePending, addJob, loadState } from "../lib/state.js";
import { getSpawner } from "../lib/spawner.js";
import type { StopInput, Job } from "../types.js";
import type { Logger } from "../lib/logger.js";

interface StopGateResult {
  action: "allow";
  spawned: boolean;
  jobId?: string;
}

interface StopGateOptions {
  pluginRoot: string;
  pluginData: string;
  reviewModel?: string;
  platform?: string;
}

export function handleStopGate(
  statePath: string,
  sessionsDir: string,
  sessionId: string,
  input: StopInput,
  options: StopGateOptions,
  logger: Logger
): StopGateResult {
  if (input.stop_hook_active) {
    return { action: "allow", spawned: false };
  }
  if (!input.session_id || !input.transcript_path) {
    return { action: "allow", spawned: false };
  }
  const hasPending = consumePending(statePath, input.session_id);
  if (!hasPending) {
    logger.info("review_skipped", { reason: "no_pending_review", session_id: input.session_id });
    return { action: "allow", spawned: false };
  }
  try {
    const spawner = getSpawner(options.platform);
    const startTime = Date.now();
    const jobPromise = spawner.spawnReviewProcess({
      sessionId: input.session_id,
      transcriptPath: input.transcript_path,
      pluginRoot: options.pluginRoot,
      pluginData: options.pluginData,
      reviewModel: options.reviewModel,
    });
    logger.info("review_launched", { session_id: input.session_id });

    jobPromise.then((job: Job) => {
      addJob(statePath, job);
      const duration = Date.now() - startTime;
      logger.debug("spawn_completed", { exit_code: 0, duration_ms: duration, job_id: job.id, pid: job.pid });
    }).catch((err: unknown) => {
      const duration = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : String(err);
      logger.info("review_error", { error: msg, stage: "spawn", session_id: input.session_id, duration_ms: duration });
    });
    return { action: "allow", spawned: true, jobId: "pending" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.info("review_error", { error: msg, stage: "spawn", session_id: input.session_id });
    return { action: "allow", spawned: false };
  }
}
