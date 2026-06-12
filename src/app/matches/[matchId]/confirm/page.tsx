import { MobileShell } from "@/components/app/mobile-shell";
import {
  MatchResultConfirmation,
  type MatchResultConfirmationData,
} from "@/components/match/match-result-confirmation";

const demoConfirmation: MatchResultConfirmationData = {
  clubName: "Downtown Rec Club",
  submittedAt: "Aug 2nd, 2026 @ 8:53pm",
  teamA: {
    label: "Team A",
    players: [
      { id: "alice", initials: "AT", name: "Alice Tan" },
      { id: "cory", initials: "CS", name: "Cory Shah" },
    ],
  },
  teamB: {
    label: "Team B",
    players: [
      { id: "bea", initials: "BR", name: "Bea Rivera" },
      { id: "dev", initials: "DO", name: "Dev Okafor" },
    ],
  },
  sets: [
    { label: "Set 1", teamAScore: 21, teamBScore: 18, winner: "A" },
    { label: "Set 2", teamAScore: 13, teamBScore: 21, winner: "B" },
    { label: "Set 3", teamAScore: 21, teamBScore: 18, winner: "A" },
  ],
};

export default async function MatchResultConfirmationPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  await params;

  return (
    <MobileShell active="Home">
      <MatchResultConfirmation
        groupId="demo"
        groupName="Downtown Rec"
        reviewCount={3}
        match={demoConfirmation}
      />
    </MobileShell>
  );
}
