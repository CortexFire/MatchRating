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
import styles from "./page.module.css";

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
          <Button asChild className={styles.inviteButton}>
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
        <section className={styles.memberList}>
          {players.map((player) => (
            <PlayerRow key={player.id} player={player} analyticsHref={`/groups/${groupId}/players/${player.id}/analytics`} />
          ))}
        </section>
      ) : (
        <p className={styles.empty}>No members yet.</p>
      )}
    </MobileShell>
  );
}
