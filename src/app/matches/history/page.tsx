export const dynamic = "force-dynamic";

import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { MatchHistoryList } from "@/components/match/match-history-list";
import { listCurrentUserGroups, listCurrentUserMatches } from "@/lib/app-data";

export default async function HistoryPage() {
  const [groups, matches] = await Promise.all([
    listCurrentUserGroups(),
    listCurrentUserMatches(),
  ]);
  const primaryGroup = groups[0];

  return (
    <MobileShell
      active="Home"
      recordHref={primaryGroup ? `/groups/${primaryGroup.id}/matches/new` : undefined}
    >
      <ScreenHeader title="Match history" backHref="/home" />
      <MatchHistoryList matches={matches} showGroupName />
    </MobileShell>
  );
}
