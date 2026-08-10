import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import { PendingReviewList } from "@/components/match/pending-review-list";
import { listCurrentUserGroups, listPendingReviewsForCurrentUser } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export default async function ReviewMatchesPage() {
  const [groups, matches] = await Promise.all([
    listCurrentUserGroups(),
    listPendingReviewsForCurrentUser(),
  ]);
  const primaryGroup = groups[0];

  return (
    <MobileShell
      recordHref={primaryGroup ? `/groups/${primaryGroup.id}/matches/new` : undefined}
      surfaceClassName="max-w-[488px]"
    >
      <header className="relative flex min-h-14 items-center justify-center">
        <Link
          href="/groups"
          aria-label="Go back"
          className="absolute left-0 inline-flex size-11 items-center justify-start text-ink transition hover:text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          <ChevronLeft aria-hidden="true" className="size-8 stroke-[2.5]" />
        </Link>
        <h1 className="text-center text-2xl font-bold leading-8 text-ink">Review Matches</h1>
      </header>
      {matches.length ? (
        <PendingReviewList matches={matches.map((match) => {
          const winning = match.winnerTeam === "A" ? match.teamA : match.teamB;
          const losing = match.winnerTeam === "A" ? match.teamB : match.teamA;
          const winningGames = match.games.filter((game) => game.winnerTeam === match.winnerTeam).length;
          const losingGames = match.games.length - winningGames;
          return {
            id: match.id,
            groupId: match.groupId,
            summary: `${shortTeamName(winning)} def. ${shortTeamName(losing)}`,
            details: `${formatSubmittedAt(match.submittedAt)} @ ${match.groupName}`,
            score: match.games.length ? `${winningGames} - ${losingGames}` : "—",
            format: match.format === "singles" ? "Singles" : "Doubles",
          };
        })} />
      ) : (
        <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">No pending reviews yet.</p>
      )}
    </MobileShell>
  );
}

function shortTeamName(players: Array<{ name: string }>) {
  return players.map((player) => player.name.split(" ")[0]).join("/");
}

function formatSubmittedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}
