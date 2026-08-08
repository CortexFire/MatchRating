import { NextResponse } from "next/server";
import { dispatchRecoverableRatingJobs } from "@/lib/ratings/rebuild-dispatch";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const service = createSupabaseServiceClient();
  const [runs, draftCleanup] = await Promise.all([
    dispatchRecoverableRatingJobs(),
    service.from("active_match_drafts").delete().lt("expires_at", new Date().toISOString()).is("submitted_match_id", null),
  ]);
  if (draftCleanup.error) {
    console.error("active_draft_cleanup_failed", { error: draftCleanup.error.message });
  }
  return NextResponse.json({ dispatched: runs.filter(Boolean).length });
}
