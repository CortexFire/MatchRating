import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Suspense } from "react";
import { MobileShell } from "@/components/app/mobile-shell";
import { MatchResultList } from "@/components/match/match-result-list";
import { listCurrentUserGroups, listPendingReviewsForCurrentUser } from "@/lib/app-data";
import { toMatchResultSummary } from "@/lib/matches/match-result-summary";
import MatchesLoading from "../loading";

export const unstable_instant = { prefetch: "static" };

export default function ReviewMatchesPage() {
  return (
    <Suspense fallback={<MatchesLoading />}>
      <ReviewMatchesContent />
    </Suspense>
  );
}

export async function ReviewMatchesContent() {
  const [groups, matches] = await Promise.all([
    listCurrentUserGroups(),
    listPendingReviewsForCurrentUser(),
  ]);
  const primaryGroup = groups[0];

  return (
    <MobileShell
      recordHref={primaryGroup ? `/groups/${primaryGroup.id}/matches/new` : undefined}
      surfaceClassName="max-w-[488px]"
    >
      <header className="relative flex min-h-14 items-center justify-center">
        <Link
          href="/groups"
          aria-label="Go back"
          className="absolute left-0 inline-flex size-11 items-center justify-start text-ink transition hover:text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          <ChevronLeft aria-hidden="true" className="size-8 stroke-[2.5]" />
        </Link>
        <h1 className="text-center text-2xl font-bold leading-8 text-ink">Review Matches</h1>
      </header>
      <p className="rounded-lg border border-stroke bg-surface p-4 text-sm leading-5 text-muted">
        Confirmation is optional. Confirm if correct, dispute to correct it, or do nothing; matches are typically accepted automatically within 24–48 hours.
      </p>
      {matches.length ? (
        <MatchResultList matches={matches.map(toMatchResultSummary)} />
      ) : (
        <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">No pending reviews yet.</p>
      )}
    </MobileShell>
  );
}
