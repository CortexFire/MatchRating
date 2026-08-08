export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { MatchHistoryList } from "@/components/match/match-history-list";
import { canCurrentUserReadGroup, listGroupMatches } from "@/lib/app-data";

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  if (!(await canCurrentUserReadGroup(groupId))) notFound();
  const matches = await listGroupMatches(groupId);

  return (
    <MobileShell active="History" recordHref={`/groups/${groupId}/matches/new`}>
      <ScreenHeader title="Match history" subtitle="Historical revisions are the source of truth for every rating rebuild." backHref={`/groups/${groupId}`} />
      <MatchHistoryList matches={matches} />
    </MobileShell>
  );
}
