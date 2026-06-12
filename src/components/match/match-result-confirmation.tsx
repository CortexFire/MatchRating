import { ArrowLeft, ArrowRight, ChevronDown, Medal } from "lucide-react";
import Link from "next/link";
import { cn } from "../../lib/utils";

type TeamKey = "A" | "B";

type Player = {
  id: string;
  initials: string;
  name: string;
};

type Team = {
  label: string;
  players: Player[];
};

type SetScore = {
  label: string;
  teamAScore: number;
  teamBScore: number;
  winner: TeamKey;
};

export type MatchResultConfirmationData = {
  clubName: string;
  submittedAt: string;
  teamA: Team;
  teamB: Team;
  sets: SetScore[];
};

export function MatchResultConfirmation({
  groupId,
  groupName,
  reviewCount,
  match,
}: {
  groupId: string;
  groupName: string;
  reviewCount: number;
  match: MatchResultConfirmationData;
}) {
  const disputeHref = buildDisputeHref(groupId, match);

  return (
    <section className="flex min-h-full flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="max-w-[230px] text-[26px] font-bold leading-[30px] text-ink">
            Match Result Confirmation
          </h1>
          <p className="mt-1 text-base leading-6 text-muted">
            {reviewCount} matches to review
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-selection px-3 text-xs font-bold text-ink transition hover:bg-victory focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          aria-label={`Current group ${groupName}`}
        >
          {groupName}
          <ChevronDown aria-hidden="true" className="size-4" />
        </button>
      </div>

      <article className="rounded-lg border border-stroke bg-surface px-4 pb-6 pt-4 shadow-sm">
        <div className="flex items-start justify-between gap-3 text-sm">
          <h2 className="font-bold leading-5 text-muted">{match.clubName}</h2>
          <p className="shrink-0 text-right text-xs leading-5 text-muted">{match.submittedAt}</p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-7 px-1">
          <TeamSummary team={match.teamA} winner={true} />
          <TeamSummary team={match.teamB} winner={false} />
        </div>

        <div className="mt-9 flex flex-col gap-4">
          {match.sets.map((set) => (
            <SetScoreRow key={set.label} set={set} />
          ))}
        </div>

        <div className="mt-12 grid grid-cols-2 gap-4">
          <button
            type="button"
            className="inline-flex min-h-14 min-w-11 items-center justify-center rounded-lg bg-action px-4 text-base font-semibold text-white transition hover:bg-selection-stroke focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            Confirm
          </button>
          <Link
            href={disputeHref}
            className="inline-flex min-h-14 min-w-11 items-center justify-center rounded-lg border border-stroke bg-surface px-4 text-base font-semibold text-ink transition hover:bg-app-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            Dispute
          </Link>
        </div>
      </article>
    </section>
  );
}

function buildDisputeHref(groupId: string, match: MatchResultConfirmationData) {
  const params = new URLSearchParams({
    format: match.teamA.players.length === 1 ? "singles" : "doubles",
    teamA: match.teamA.players.map((player) => player.id).join(","),
    teamB: match.teamB.players.map((player) => player.id).join(","),
    scores: match.sets.map((set) => `${set.teamAScore}-${set.teamBScore}`).join(","),
  });

  return `/groups/${groupId}/matches/new?${params.toString()}`;
}

function TeamSummary({ team, winner }: { team: Team; winner: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-3">
      <div
        className={cn(
          "flex min-h-7 items-center gap-2 text-lg font-bold leading-7",
          winner ? "text-ink" : "text-muted",
        )}
      >
        {winner ? <Medal aria-hidden="true" className="size-6 text-selection-stroke" /> : null}
        <h3>{team.label}</h3>
      </div>
      <div
        className={cn(
          "flex min-h-[112px] w-full flex-col justify-center gap-4 rounded-lg border px-5 py-4",
          winner ? "border-victory-stroke bg-victory" : "border-stroke bg-surface",
        )}
      >
        {team.players.map((player, index) => (
          <div key={`${team.label}-${player.name}-${index}`} className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-app-bg text-sm font-bold text-ink">
              {player.initials}
            </span>
            <span className="min-w-0 truncate text-lg font-bold leading-6 text-ink">
              {player.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SetScoreRow({ set }: { set: SetScore }) {
  return (
    <div>
      <div className="border-b border-stroke pb-1">
        <h3 className="text-lg font-bold leading-7 text-muted">{set.label}</h3>
      </div>
      <div className="grid grid-cols-[1fr_50px_1fr] items-center gap-3 px-3 pt-3">
        <ScoreTile score={set.teamAScore} result={set.winner === "A" ? "Win" : "Loss"} />
        <SetArrow winner={set.winner} />
        <ScoreTile score={set.teamBScore} result={set.winner === "B" ? "Win" : "Loss"} />
      </div>
    </div>
  );
}

function SetArrow({ winner }: { winner: TeamKey }) {
  const Icon = winner === "A" ? ArrowLeft : ArrowRight;

  return (
    <div className="flex justify-center text-muted">
      <Icon aria-hidden="true" className="h-5 w-14 max-w-full stroke-[1.5]" />
      <span className="sr-only">Winner: Team {winner}</span>
    </div>
  );
}

function ScoreTile({ score, result }: { score: number; result: "Win" | "Loss" }) {
  const won = result === "Win";

  return (
    <div
      className={cn(
        "flex min-h-20 min-w-0 flex-col items-center justify-center rounded-lg border px-2 py-2",
        won ? "border-victory-stroke bg-victory" : "border-stroke bg-surface",
      )}
    >
      <p className="text-[40px] font-bold leading-10 tabular-nums text-ink">{score}</p>
      <p className="mt-1 text-sm leading-5 text-muted">{result}</p>
    </div>
  );
}
