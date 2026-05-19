import { consumePending, addJob, loadState, updateJob } from "../lib/state.js";
import { getSpawner } from "../lib/spawner.js";
import type { JobLifecycleCallbacks } from "../lib/spawner.js";
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
  reviewMaxTurns?: number;
  platform?: string; // Used only for spawner selection, not passed to spawn process
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
  if (process.env.SELF_EVOLUTION_REVIEW_MODE === "1") {
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

    const callbacks: JobLifecycleCallbacks = {
      onJobCreated(job) {
        addJob(statePath, job);
      },
      onJobExit(jobId, code) {
        const status = code === 0 ? "completed" : "failed";
        updateJob(statePath, jobId, {
          status,
          completed_at: new Date().toISOString(),
        });
        const duration = Date.now() - startTime;
        logger.info("companion_exit", { job_id: jobId, exit_code: code, status, duration_ms: duration });
      },
      onJobError(jobId, err) {
        updateJob(statePath, jobId, {
          status: "failed",
          completed_at: new Date().toISOString(),
        });
        logger.info("companion_error", { job_id: jobId, error: err.message });
      },
    };

    const jobPromise = spawner.spawnReviewProcess({
      sessionId: input.session_id,
      transcriptPath: input.transcript_path,
      pluginRoot: options.pluginRoot,
      pluginData: options.pluginData,
      reviewModel: options.reviewModel,
      reviewMaxTurns: options.reviewMaxTurns,
    }, callbacks);

    jobPromise.then((job: Job) => {
      logger.info("review_launched", { session_id: input.session_id, pid: job.pid });
      logger.debug("spawn_launched", { command: "claude -p", pid: job.pid });
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
