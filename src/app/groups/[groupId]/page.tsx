export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { GroupMembersDisclosure } from "@/components/groups/group-members-disclosure";
import { ActiveMatchDraftList } from "@/components/match/active-match-draft-list";
import { RatingRebuildStatus } from "@/components/match/rating-rebuild-status";
import { RecentMatchList } from "@/components/match/recent-match-list";
import {
  canCurrentUserReadGroup,
  getGroup,
  getGroupRatingRebuildStatus,
  listGroupActiveMatchDrafts,
  listGroupMatches,
  listGroupPlayers,
} from "@/lib/app-data";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  if (!(await canCurrentUserReadGroup(groupId))) notFound();
  const [group, activeDrafts, ratingStatus, recentMatches, players] = await Promise.all([
    getGroup(groupId),
    listGroupActiveMatchDrafts(groupId),
    getGroupRatingRebuildStatus(groupId),
    listGroupMatches(groupId, { limit: 5 }),
    listGroupPlayers(groupId),
  ]);
  if (!group) notFound();
  const recordHref = `/groups/${groupId}/matches/new`;

  return (
    <MobileShell active="Group" recordHref={recordHref}>
      <ScreenHeader title={group.name} backHref="/groups" />
      <ActiveMatchDraftList drafts={activeDrafts} />
      <RatingRebuildStatus
        groupId={groupId}
        jobId={ratingStatus.id}
        status={ratingStatus.status}
        canRetry={ratingStatus.canRetry}
      />
      <RecentMatchList matches={recentMatches} historyHref={`/groups/${groupId}/history`} />
      <GroupMembersDisclosure players={players} inviteHref={`/groups/${groupId}/invite`} />
    </MobileShell>
  );
}
