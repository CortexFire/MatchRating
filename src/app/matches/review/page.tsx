import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Suspense } from "react";
import { MobileShell } from "@/components/app/mobile-shell";
import { MatchResultList } from "@/components/match/match-result-list";
import { listCurrentUserGroups, listPendingReviewsForCurrentUser } from "@/lib/app-data";
import { toMatchResultSummary } from "@/lib/matches/match-result-summary";
import MatchesLoading from "../loading";
import styles from "./page.module.css";

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
      surfaceClassName={styles.wideShell}
    >
      <header className={styles.header}>
        <Link href="/groups" aria-label="Go back" className={styles.backLink}>
          <ChevronLeft aria-hidden="true" className={styles.backIcon} />
        </Link>
        <h1 className={styles.title}>Review Matches</h1>
      </header>
      <p className={styles.infoCard}>
        Confirmation is optional. Confirm if correct, dispute to correct it, or do nothing; matches are typically accepted automatically within 24–48 hours.
      </p>
      {matches.length ? (
        <MatchResultList matches={matches.map(toMatchResultSummary)} />
      ) : (
        <p className={styles.emptyState}>No pending reviews yet.</p>
      )}
    </MobileShell>
  );
}
