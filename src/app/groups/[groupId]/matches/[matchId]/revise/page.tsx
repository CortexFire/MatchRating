export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { MobileShell } from "@/components/app/mobile-shell";
import { MatchRevisionRecorder } from "@/components/match/match-revision-recorder";
import { getGroupMatchDetail, listGroupPlayers } from "@/lib/app-data";

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
  const players = await listGroupPlayers(groupId);

  return (
    <MobileShell active="History" recordHref={`/groups/${groupId}/matches/new`}>
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
          games: match.games.map((game) => ({ teamAScore: game.teamAScore, teamBScore: game.teamBScore })),
        }}
      />
    </MobileShell>
  );
}
