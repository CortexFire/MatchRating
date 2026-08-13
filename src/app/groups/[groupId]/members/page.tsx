export const unstable_instant = {
  prefetch: "static",
  samples: [{ params: { groupId: "00000000-0000-0000-0000-000000000000" } }],
};

import Link from "next/link";
import { Suspense } from "react";
import { MobileShell } from "@/components/app/mobile-shell";
import { PlayerRow } from "@/components/app/player-row";
import { ScreenHeader } from "@/components/app/screen-header";
import { RatingRebuildStatus } from "@/components/match/rating-rebuild-status";
import { Button } from "@/components/ui/button";
import { getGroup, getGroupRatingRebuildStatus, listGroupPlayers } from "@/lib/app-data";
import GroupLoading from "../loading";

type MembersPageProps = {
  params: Promise<{ groupId: string }>;
};

export default function MembersPage(props: MembersPageProps) {
  return (
    <Suspense fallback={<GroupLoading />}>
      <MembersContent {...props} />
    </Suspense>
  );
}

export async function MembersContent({
  params,
}: MembersPageProps) {
  const { groupId } = await params;
  const [group, players, ratingStatus] = await Promise.all([
    getGroup(groupId),
    listGroupPlayers(groupId),
    getGroupRatingRebuildStatus(groupId),
  ]);
  const recordHref = `/groups/${groupId}/matches/new`;
  const activePlayerCount = players.filter((player) => player.status === "Active").length;

  return (
    <MobileShell active="Home" recordHref={recordHref}>
      <ScreenHeader
        title="Members"
        subtitle={group ? `${activePlayerCount} active of ${group.memberCount} members.` : undefined}
        backHref={`/groups/${groupId}`}
        action={
          <Button asChild className="shrink-0 px-3 text-xs">
            <Link href={`/groups/${groupId}/invite`}>Invite Members</Link>
          </Button>
        }
      />
      <RatingRebuildStatus
        key={ratingStatus.id ?? "no-rating-job"}
        groupId={groupId}
        jobId={ratingStatus.id}
        status={ratingStatus.status}
        canRetry={ratingStatus.canRetry}
        refreshOnComplete
      />
      {players.length ? (
        <section className="flex flex-col gap-2">
          {players.map((player) => (
            <PlayerRow key={player.id} player={player} />
          ))}
        </section>
      ) : (
        <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">No members yet.</p>
      )}
    </MobileShell>
  );
}
