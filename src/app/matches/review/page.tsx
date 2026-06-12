import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import {
  PendingReviewList,
  type PendingReviewMatch,
} from "@/components/match/pending-review-list";
import { demoMatches, type DemoMatch } from "@/lib/demo-data";
import { getPendingReviewMatches } from "@/lib/home";

export default function ReviewMatchesPage() {
  const pendingMatches = getPendingReviewMatches(demoMatches).map(toPendingReviewMatch);

  return (
    <MobileShell surfaceClassName="max-w-[488px]">
      <header className="relative flex min-h-14 items-center justify-center">
        <Link
          href="/groups/demo"
          aria-label="Go back"
          className="absolute left-0 inline-flex size-11 items-center justify-start text-ink transition hover:text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          <ChevronLeft aria-hidden="true" className="size-8 stroke-[2.5]" />
        </Link>
        <h1 className="text-center text-2xl font-bold leading-8 text-ink">
          Review Matches
        </h1>
      </header>
      <PendingReviewList matches={pendingMatches} />
    </MobileShell>
  );
}

function toPendingReviewMatch(match: DemoMatch): PendingReviewMatch {
  const winningTeam = match.winnerTeam === "A" ? match.teamA : match.teamB;
  const losingTeam = match.winnerTeam === "A" ? match.teamB : match.teamA;

  return {
    id: match.id,
    summary: `${shortTeamName(winningTeam)} def. ${shortTeamName(losingTeam)}`,
    details: `${match.submittedAt} @ Downtown Rec`,
    score: match.scores[0].replace("-", " - "),
    format: `Best of ${match.scores.length}`,
  };
}

function shortTeamName(players: string[]) {
  return players.map((player) => player.split(" ")[0]).join("/");
}
