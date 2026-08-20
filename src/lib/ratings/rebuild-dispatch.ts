import { randomUUID } from "node:crypto";
import { start } from "workflow/api";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { rebuildGroupRatingsWorkflow } from "@/workflows/rebuild-group-ratings";

export type RatingJobStatus = "queued" | "running" | "completed" | "failed";

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String(error.message)
      : String(error);
}

type RatingDispatchOptions = {
  logErrors?: boolean;
};

export async function dispatchRatingRebuild(
  jobId: string,
  options: RatingDispatchOptions = {},
) {
  const service = createSupabaseServiceClient();
  const dispatchToken = randomUUID();
  const { data: claimed, error } = await service.rpc("claim_rating_rebuild_dispatch", {
    p_job_id: jobId,
    p_dispatch_token: dispatchToken,
  });

  if (error) throw error;
  if (!claimed) return null;

  try {
    const run = await start(rebuildGroupRatingsWorkflow, [jobId, dispatchToken]);
    const { error: updateError } = await service
      .from("rating_rebuild_jobs")
      .update({ workflow_run_id: run.runId, updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("dispatch_token", dispatchToken);
    if (updateError && options.logErrors !== false) {
      console.error("rating_dispatch_metadata_update_failed", {
        jobId,
        runId: run.runId,
        error: errorMessage(updateError),
      });
    }
    return run.runId;
  } catch (error) {
    // The leased queued job is intentionally left for the recovery route.
    if (options.logErrors !== false) {
      console.error("rating_workflow_start_failed", {
        jobId,
        error: errorMessage(error),
      });
    }
    return null;
  }
}

export async function dispatchRecoverableRatingJobs(
  limit = 25,
  options: RatingDispatchOptions = {},
) {
  const service = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("rating_rebuild_jobs")
    .select("id")
    .eq("status", "queued")
    .or(`dispatch_token.is.null,dispatch_lease_expires_at.lt.${now}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return Promise.all(
    (data ?? []).map(async (job: { id: string }) => {
      try {
        return await dispatchRatingRebuild(job.id, options);
      } catch (jobError) {
        if (options.logErrors !== false) {
          console.error("rating_dispatch_recovery_failed", {
            jobId: job.id,
            error: errorMessage(jobError),
          });
        }
        return null;
      }
    }),
  );
}
