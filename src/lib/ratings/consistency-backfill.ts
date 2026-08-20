import type { createSupabaseServiceClient } from "../supabase/server";

export type ConsistencyBackfillGroup = {
  groupId: string;
  actorId: string;
};

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;
const PAGE_SIZE = 1_000;
const DISPATCH_BATCH_SIZE = 25;

export async function listConsistencyBackfillGroups(
  service: Pick<ServiceClient, "from">,
): Promise<ConsistencyBackfillGroup[]> {
  const groups: ConsistencyBackfillGroup[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await service
      .from("groups")
      .select("id, owner_user_id")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as Array<{ id: string; owner_user_id: string }>;
    for (const row of page) {
      if (!row.id || !row.owner_user_id) throw new Error("Invalid consistency backfill group");
      groups.push({ groupId: row.id, actorId: row.owner_user_id });
    }
    if (page.length < PAGE_SIZE) break;
  }
  if (new Set(groups.map((group) => group.groupId)).size !== groups.length) {
    throw new Error("Invalid consistency backfill group");
  }
  return groups;
}

export async function enqueueGroupConsistencyRebuild(
  service: Pick<ServiceClient, "rpc">,
  group: ConsistencyBackfillGroup,
) {
  const { data, error } = await service.rpc("enqueue_rating_rebuild", {
    p_group_id: group.groupId,
    p_from_match_id: null,
    p_actor: group.actorId,
  });
  if (error) throw error;
  return data;
}

export async function runConsistencyBackfill({
  listGroups,
  enqueueRatingRebuild,
  dispatchRecoverableRatingJobs,
}: {
  listGroups(): Promise<ConsistencyBackfillGroup[]>;
  enqueueRatingRebuild(group: ConsistencyBackfillGroup): Promise<unknown>;
  dispatchRecoverableRatingJobs(limit: number): Promise<Array<string | null>>;
}) {
  const groups = await listGroups();
  let enqueuedCount = 0;
  for (const group of groups) {
    await enqueueRatingRebuild(group);
    enqueuedCount += 1;
  }

  let dispatchedCount = 0;
  while (true) {
    const batch = await dispatchRecoverableRatingJobs(DISPATCH_BATCH_SIZE);
    dispatchedCount += batch.filter((runId) => typeof runId === "string" && runId.length > 0).length;
    if (batch.length < DISPATCH_BATCH_SIZE) break;
  }

  return { groupCount: groups.length, enqueuedCount, dispatchedCount };
}
