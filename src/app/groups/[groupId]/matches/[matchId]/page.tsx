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
import { MatchResultConfirmation } from "@/components/match/match-result-confirmation";
import { getGroupMatchDetail } from "@/lib/app-data";
import GroupMatchLoading from "../loading";

type MatchPageProps = {
  params: Promise<{ groupId: string; matchId: string }>;
};

export default function MatchPage(props: MatchPageProps) {
  return (
    <Suspense fallback={<GroupMatchLoading />}>
      <MatchContent {...props} />
    </Suspense>
  );
}

export async function MatchContent({ params }: MatchPageProps) {
  const { groupId, matchId } = await params;
  const match = await getGroupMatchDetail(groupId, matchId);
  if (!match) notFound();

  return (
    <MobileShell active="History" recordHref={`/groups/${groupId}/matches/new`}>
      <MatchResultConfirmation
        groupId={groupId}
        groupName={match.groupName}
        canConfirm={match.canConfirm}
        canDispute={match.canDispute}
        canRevise={match.canRevise}
        match={{
          id: match.id,
          revisionId: match.revisionId,
          status: match.status,
          winnerTeam: match.winnerTeam,
          clubName: match.groupName,
          submittedAt: formatSubmittedAt(match.submittedAt),
          disputeUntil: formatDisputeUntil(match.disputeUntil),
          teamA: { label: "Team A", players: match.teamA },
          teamB: { label: "Team B", players: match.teamB },
          sets: match.games.map((game) => ({
            label: `Set ${game.gameNumber}`,
            teamAScore: game.teamAScore,
            teamBScore: game.teamBScore,
            winner: game.winnerTeam,
          })),
        }}
      />
    </MobileShell>
  );
}

function formatDisputeUntil(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}

function formatSubmittedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}
