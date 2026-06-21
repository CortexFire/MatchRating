import Link from "next/link";
import { MobileShell } from "@/components/app/mobile-shell";
import { AvatarInitials } from "@/components/ui/avatar";
import {
  demoCurrentGames,
  demoMatches,
  demoUser,
  type DemoCurrentGame,
} from "@/lib/demo-data";
import {
  getPendingReviewMatches,
  getPrimaryCurrentGame,
  splitCurrentGameTeams,
  toPendingReviewSummary,
  type HomePendingReviewSummary,
} from "@/lib/home";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  await params;

  const activeMatch = getPrimaryCurrentGame(demoCurrentGames);
  const pendingReviews = getPendingReviewMatches(demoMatches).map(toPendingReviewSummary);

  return (
    <MobileShell active="Home">
      <HomeHeader />
      <ActiveMatchCard game={activeMatch} />
      <PendingReviewSection matches={pendingReviews} />
    </MobileShell>
  );
}

function HomeHeader() {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0 pt-1">
        <p className="text-2xl font-bold leading-7 text-ink">Hi,</p>
        <h1 className="truncate text-3xl font-bold leading-9 text-ink">{demoUser.name}</h1>
      </div>
      <Link
        href="/profile"
        aria-label="Open profile"
        className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        <AvatarInitials
          initials={demoUser.initials}
          className="size-[68px] border-2 border-stroke bg-victory text-xl shadow-sm"
        />
      </Link>
    </header>
  );
}

function ActiveMatchCard({ game }: { game?: DemoCurrentGame }) {
  const teams = game ? splitCurrentGameTeams(game) : undefined;

  return (
    <section className="rounded-lg border border-stroke bg-surface p-4">
      <h2 className="text-2xl font-bold leading-7 text-ink">Active Match</h2>
      {game && teams ? (
        <article className="mt-5 rounded-lg border border-stroke bg-surface px-4 py-3">
          <p className="text-base leading-6 text-muted">
            {game.startedAt} @ {game.groupName}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <ActiveTeam players={teams.teamA} />
            <ActiveTeam players={teams.teamB} />
          </div>
        </article>
      ) : (
        <p className="mt-4 rounded-lg border border-stroke bg-surface px-4 py-5 text-sm text-muted">
          No active match right now.
        </p>
      )}
    </section>
  );
}

function ActiveTeam({ players }: { players: string[] }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center">
        {players.map((player, index) => (
          <AvatarInitials
            key={player}
            initials={getInitials(player)}
            className={index === 0 ? "size-10 bg-victory text-sm" : "-ml-1 size-10 bg-victory text-sm"}
          />
        ))}
      </div>
      <p className="mt-2 text-sm leading-5 text-ink">{formatTeamName(players)}</p>
    </div>
  );
}

function PendingReviewSection({ matches }: { matches: HomePendingReviewSummary[] }) {
  return (
    <section className="rounded-lg border border-stroke bg-surface p-4">
      <h2 className="text-2xl font-bold leading-7 text-ink">Pending Review</h2>
      <div className="mt-4 flex flex-col gap-2.5">
        {matches.map((match) => (
          <HomePendingReviewRow key={match.id} match={match} />
        ))}
      </div>
    </section>
  );
}

function HomePendingReviewRow({ match }: { match: HomePendingReviewSummary }) {
  return (
    <Link
      href={`/matches/${match.id}/confirm`}
      className="flex min-h-[74px] items-center justify-between gap-3 rounded-lg border border-stroke bg-surface px-4 py-2.5 transition hover:border-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-bold leading-6 text-muted">{match.summary}</p>
        <p className="mt-1 truncate text-sm leading-5 text-muted">{match.details}</p>
      </div>
      <div className="grid min-h-14 min-w-[108px] shrink-0 place-items-center rounded-lg border border-stroke bg-surface px-3 py-1.5 text-center">
        <div>
          <p className="text-xl font-bold leading-6 tabular-nums text-action">{match.score}</p>
          <p className="text-sm leading-5 text-muted">{match.format}</p>
        </div>
      </div>
    </Link>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("");
}

function formatTeamName(players: string[]) {
  return players.join(" & ");
}
