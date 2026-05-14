import { consumePending, addJob } from "../lib/state.js";
import { getSpawner } from "../lib/spawner.js";
import type { StopInput, Job } from "../types.js";

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
  input: StopInput,
  options: StopGateOptions
): StopGateResult {
  if (input.stop_hook_active) {
    return { action: "allow", spawned: false };
  }
  if (!input.session_id || !input.transcript_path) {
    return { action: "allow", spawned: false };
  }
  const hasPending = consumePending(statePath, input.session_id);
  if (!hasPending) {
    return { action: "allow", spawned: false };
  }
  try {
    const spawner = getSpawner(options.platform);
    const jobPromise = spawner.spawnReviewProcess({
      sessionId: input.session_id,
      transcriptPath: input.transcript_path,
      pluginRoot: options.pluginRoot,
      pluginData: options.pluginData,
      reviewModel: options.reviewModel,
    });
    jobPromise.then((job: Job) => {
      addJob(statePath, job);
    }).catch((err: unknown) => {
      console.error("stop-gate: failed to spawn review process:", err);
    });
    return { action: "allow", spawned: true, jobId: "pending" };
  } catch {
    return { action: "allow", spawned: false };
  }
}
