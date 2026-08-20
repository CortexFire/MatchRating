import {
  enqueueGroupConsistencyRebuild,
  listConsistencyBackfillGroups,
  runConsistencyBackfill,
} from "../src/lib/ratings/consistency-backfill";
import { dispatchRecoverableRatingJobs } from "../src/lib/ratings/rebuild-dispatch";
import { createSupabaseServiceClient } from "../src/lib/supabase/server";

async function main() {
  const service = createSupabaseServiceClient();
  const summary = await runConsistencyBackfill({
    listGroups: () => listConsistencyBackfillGroups(service),
    enqueueRatingRebuild: (group) => enqueueGroupConsistencyRebuild(service, group),
    dispatchRecoverableRatingJobs: (limit) => dispatchRecoverableRatingJobs(limit, {
      logErrors: false,
    }),
  });
  console.log(JSON.stringify(summary));
}

main().catch(() => {
  console.error("Consistency backfill failed");
  process.exitCode = 1;
});
