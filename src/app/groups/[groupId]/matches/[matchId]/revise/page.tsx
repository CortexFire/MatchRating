export const unstable_instant = {
  prefetch: "static",
  samples: [
    {
      params: {
        groupId: "00000000-0000-0000-0000-000000000000",
        matchId: "00000000-0000-0000-0000-000000000000",
      },
    },
  ],
};

import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MobileShell } from "@/components/app/mobile-shell";
import { MatchRevisionRecorder } from "@/components/match/match-revision-recorder";
import { RatingRebuildStatus } from "@/components/match/rating-rebuild-status";
import { getGroupMatchDetail, getGroupRatingRebuildStatus, listGroupPlayers } from "@/lib/app-data";
import GroupMatchLoading from "../../loading";

type ReviseMatchPageProps = {
  params: Promise<{ groupId: string; matchId: string }>;
};

export default function ReviseMatchPage(props: ReviseMatchPageProps) {
  return (
    <Suspense fallback={<GroupMatchLoading />}>
      <ReviseMatchContent {...props} />
    </Suspense>
  );
}

export async function ReviseMatchContent({ params }: ReviseMatchPageProps) {
  const { groupId, matchId } = await params;
  const match = await getGroupMatchDetail(groupId, matchId);
  if (!match) notFound();

  const mode = (match.status === "pending_confirmation" || match.status === "confirmed") && match.canDispute
    ? "dispute"
    : match.status === "disputed" && match.canRevise
      ? "revise"
      : null;
  if (!mode) notFound();
  const [players, ratingStatus] = await Promise.all([
    listGroupPlayers(groupId),
    getGroupRatingRebuildStatus(groupId),
  ]);

  return (
    <MobileShell active="History" recordHref={`/groups/${groupId}/matches/new`}>
      <RatingRebuildStatus
        key={ratingStatus.id ?? "no-rating-job"}
        groupId={groupId}
        jobId={ratingStatus.id}
        status={ratingStatus.status}
        canRetry={ratingStatus.canRetry}
        showPending={false}
      />
      <MatchRevisionRecorder
        groupId={groupId}
        groupName={match.groupName}
        matchId={match.id}
        expectedRevisionId={match.revisionId}
        mode={mode}
        players={players}
        initialMatch={{
          format: match.format,
          teamAUserIds: match.teamA.map((player) => player.id),
          teamBUserIds: match.teamB.map((player) => player.id),
          games: match.games.map((game) => ({
            teamAScore: game.teamAScore,
            teamBScore: game.teamBScore,
            winnerTeam: game.winnerTeam,
          })),
        }}
      />
    </MobileShell>
  );
}
