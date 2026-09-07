export const unstable_instant = {
  prefetch: "static",
  samples: [{ params: { groupId: "00000000-0000-0000-0000-000000000000" } }],
};

import { Suspense } from "react";
import { MobileShell } from "@/components/app/mobile-shell";
import { PlayerRow } from "@/components/app/player-row";
import { ScreenHeader } from "@/components/app/screen-header";
import { RatingRebuildStatus } from "@/components/match/rating-rebuild-status";
import { getGroupRatingRebuildStatus, listGroupPlayers } from "@/lib/app-data";
import GroupLoading from "../loading";
import styles from "./page.module.css";

type RankingsPageProps = {
  params: Promise<{ groupId: string }>;
};

export default function RankingsPage(props: RankingsPageProps) {
  return (
    <Suspense fallback={<GroupLoading />}>
      <RankingsContent {...props} />
    </Suspense>
  );
}

export async function RankingsContent({ params }: RankingsPageProps) {
  const { groupId } = await params;
  const [players, ratingStatus] = await Promise.all([listGroupPlayers(groupId), getGroupRatingRebuildStatus(groupId)]);
  const rankedPlayers = players.filter((player) => player.gamesPlayed > 0);
  const recordHref = `/groups/${groupId}/matches/new`;

  return (
    <MobileShell active="Rank" recordHref={recordHref}>
      <ScreenHeader title="Rankings" backHref={`/groups/${groupId}`} />
      <RatingRebuildStatus
        key={ratingStatus.id ?? "no-rating-job"}
        groupId={groupId}
        jobId={ratingStatus.id}
        status={ratingStatus.status}
        refreshOnComplete
      />
      {rankedPlayers.length ? (
        <section className={styles.rankingList}>
          {rankedPlayers.map((player) => (
            <PlayerRow key={player.id} player={player} analyticsHref={`/groups/${groupId}/players/${player.id}/analytics`} />
          ))}
        </section>
      ) : (
        <p className={styles.empty}>No rankings yet.</p>
      )}
    </MobileShell>
  );
}
