import { fileURLToPath } from "node:url";
import {
  createSupabaseCalibrationHistorySource,
  loadActiveCalibrationHistories,
  runConsistencyCalibration,
} from "../src/lib/ratings/consistency-calibration-command";
import { createSupabaseServiceClient } from "../src/lib/supabase/server";

const outputPath = fileURLToPath(new URL(
  "../src/lib/ratings/consistency-calibration.json",
  import.meta.url,
));
async function main() {
  const service = createSupabaseServiceClient();
  const source = createSupabaseCalibrationHistorySource(service);
  await runConsistencyCalibration({
    loadHistories: () => loadActiveCalibrationHistories(source),
    outputPath,
  });
}

main().catch(() => {
  console.error("Consistency calibration failed");
  process.exitCode = 1;
});
