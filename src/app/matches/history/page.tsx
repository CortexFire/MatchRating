export const unstable_instant = { prefetch: "static" };

import { Suspense } from "react";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { MatchHistoryList } from "@/components/match/match-history-list";
import { listCurrentUserGroups, listMatchHistoryPage } from "@/lib/app-data";
import MatchesLoading from "../loading";

export default function HistoryPage() {
  return (
    <Suspense fallback={<MatchesLoading />}>
      <MatchHistoryContent />
    </Suspense>
  );
}

export async function MatchHistoryContent() {
  const [groups, initialPage] = await Promise.all([
    listCurrentUserGroups(),
    listMatchHistoryPage({}),
  ]);
  const primaryGroup = groups[0];

  return (
    <MobileShell
      active="Home"
      recordHref={primaryGroup ? `/groups/${primaryGroup.id}/matches/new` : undefined}
    >
      <ScreenHeader title="Match history" backHref="/home" />
      <MatchHistoryList initialPage={initialPage} showGroupName />
    </MobileShell>
  );
}
