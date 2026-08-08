import { FatalError } from "workflow";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { rebuildGroupRatingsFromMatches, type HistoricalMatch } from "@/lib/ratings/glicko2";
import { toRatingProjection } from "@/lib/ratings/projection";

type RebuildInput = {
  groupId: string;
  jobId: string;
  targetVersion: number;
  history: HistoricalMatch[];
};

async function loadRebuildInput(jobId: string, dispatchToken: string): Promise<RebuildInput | null> {
  "use step";
  const { data, error } = await createSupabaseServiceClient().rpc("begin_rating_rebuild", {
    p_job_id: jobId,
    p_dispatch_token: dispatchToken,
  });
  if (error) throw error;
  return data as RebuildInput | null;
}

async function calculateProjection(input: RebuildInput) {
  "use step";
  const rebuilt = rebuildGroupRatingsFromMatches(input.history);
  return toRatingProjection(rebuilt.ratings, rebuilt.events);
}

async function applyProjection(input: RebuildInput, projection: Awaited<ReturnType<typeof calculateProjection>>) {
  "use step";
  const { data, error } = await createSupabaseServiceClient().rpc("apply_rating_rebuild", {
    p_job_id: input.jobId,
    p_expected_version: input.targetVersion,
    p_ratings: projection.ratings,
    p_events: projection.events,
  });
  if (error) throw error;
  return data as { status: "completed" | "stale"; targetVersion?: number };
}

export async function markFailed(jobId: string, message: string) {
  "use step";
  const { error } = await createSupabaseServiceClient().rpc("fail_rating_rebuild", {
    p_job_id: jobId,
    p_error: message,
  });
  if (error) throw error;
}

export async function rebuildGroupRatingsWorkflow(jobId: string, dispatchToken: string) {
  "use workflow";

  try {
    while (true) {
      const input = await loadRebuildInput(jobId, dispatchToken);
      if (!input) return { status: "not_claimed" as const };

      const projection = await calculateProjection(input);
      const applied = await applyProjection(input, projection);
      if (applied.status === "completed") return applied;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rating rebuild failed";
    await markFailed(jobId, message);
    throw new FatalError(message);
  }
}
