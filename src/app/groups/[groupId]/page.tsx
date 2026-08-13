export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { GroupMembersDisclosure } from "@/components/groups/group-members-disclosure";
import { ActiveMatchDraftList } from "@/components/match/active-match-draft-list";
import { RatingRebuildStatus } from "@/components/match/rating-rebuild-status";
import { RecentMatchList } from "@/components/match/recent-match-list";
import { getGroupPageData } from "@/lib/navigation-read-models";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const data = await getGroupPageData(groupId);
  if (!data) notFound();
  const { group, activeDrafts, ratingStatus, recentMatches, players } = data;
  const recordHref = `/groups/${groupId}/matches/new`;

  return (
    <MobileShell active="Group" recordHref={recordHref}>
      <ScreenHeader title={group.name} backHref="/groups" />
      <RatingRebuildStatus
        key={ratingStatus.id ?? "no-rating-job"}
        groupId={groupId}
        jobId={ratingStatus.id}
        status={ratingStatus.status}
        canRetry={ratingStatus.canRetry}
      />
      <GroupMembersDisclosure players={players} inviteHref={`/groups/${groupId}/invite`} />
      <ActiveMatchDraftList drafts={activeDrafts} />
      <RecentMatchList matches={recentMatches} historyHref={`/groups/${groupId}/history`} />
    </MobileShell>
  );
}
