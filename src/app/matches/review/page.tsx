import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import { PendingReviewList } from "@/components/match/pending-review-list";
import { demoMatches } from "@/lib/demo-data";
import { getPendingReviewMatches, toPendingReviewSummary } from "@/lib/home";

export default function ReviewMatchesPage() {
  const pendingMatches = getPendingReviewMatches(demoMatches).map(toPendingReviewSummary);

  return (
    <MobileShell surfaceClassName="max-w-[488px]">
      <header className="relative flex min-h-14 items-center justify-center">
        <Link
          href="/groups/demo"
          aria-label="Go back"
          className="absolute left-0 inline-flex size-11 items-center justify-start text-ink transition hover:text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          <ChevronLeft aria-hidden="true" className="size-8 stroke-[2.5]" />
        </Link>
        <h1 className="text-center text-2xl font-bold leading-8 text-ink">
          Review Matches
        </h1>
      </header>
      <PendingReviewList matches={pendingMatches} />
    </MobileShell>
  );
}
