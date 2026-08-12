export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { MobileShell } from "@/components/app/mobile-shell";
import { MatchRevisionRecorder } from "@/components/match/match-revision-recorder";
import { RatingRebuildStatus } from "@/components/match/rating-rebuild-status";
import { getGroupMatchDetail, getGroupRatingRebuildStatus, listGroupPlayers } from "@/lib/app-data";

export default async function ReviseMatchPage({
  params,
}: {
  params: Promise<{ groupId: string; matchId: string }>;
}) {
  const { groupId, matchId } = await params;
  const match = await getGroupMatchDetail(groupId, matchId);
  if (!match) notFound();

  const mode = match.status === "pending_confirmation" && match.canReview
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
