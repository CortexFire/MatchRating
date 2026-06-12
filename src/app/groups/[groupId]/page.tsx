import Link from "next/link";
import { ChevronRight, Clock, MapPin, UsersRound } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AvatarInitials } from "@/components/ui/avatar";
import {
  demoCurrentGames,
  demoMatches,
  demoUser,
  type DemoCurrentGame,
} from "@/lib/demo-data";
import { getCurrentGames, getPendingReviewMatches, getTimeGreeting } from "@/lib/home";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  await params;
  const pendingReviews = getPendingReviewMatches(demoMatches);
  const currentGames = getCurrentGames(demoCurrentGames);

  return (
    <MobileShell active="Home">
      <header className="flex items-center justify-between gap-4 pt-1">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted">{getTimeGreeting()}</p>
          <h1 className="truncate text-3xl font-bold leading-9 text-ink">{demoUser.name}</h1>
        </div>
        <Link
          href="/profile"
          aria-label="Open profile"
          className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          <AvatarInitials
            initials={demoUser.initials}
            className="size-14 border border-victory-stroke text-base shadow-sm"
          />
        </Link>
      </header>

      <Button
        asChild
        variant={pendingReviews.length > 0 ? "primary" : "secondary"}
        className="min-h-14 justify-between px-4 text-base"
      >
        <Link href="/matches/review">
          <span>Matches Pending Review</span>
          <span className="flex items-center gap-2">
            <span className="tabular-nums">{pendingReviews.length}</span>
            <ChevronRight className="size-5" aria-hidden="true" />
          </span>
        </Link>
      </Button>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Current Games</h2>
          <Button asChild variant="secondary" className="size-11 px-0" aria-label="Open group members">
            <Link href="/groups/demo/members">
              <UsersRound className="size-5" />
            </Link>
          </Button>
        </div>

        {currentGames.map((game) => (
          <CurrentGameCard key={game.id} game={game} />
        ))}
      </section>
    </MobileShell>
  );
}

function CurrentGameCard({ game }: { game: DemoCurrentGame }) {
  return (
    <article className="rounded-lg border border-stroke bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge tone="selected">In progress</Badge>
          <h3 className="mt-3 text-base font-bold text-ink">Active match</h3>
        </div>
        <div className="flex -space-x-2">
          {game.players.slice(0, 4).map((player) => (
            <AvatarInitials
              key={player}
              initials={player
                .split(" ")
                .map((name) => name[0])
                .join("")}
              className="size-9 border-2 border-surface bg-victory text-xs"
            />
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase text-muted">Players</p>
          <p className="mt-1 font-semibold text-ink">{game.players.join(" / ")}</p>
        </div>
        <div className="grid gap-2 text-muted">
          <p className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{game.groupName}</span>
          </p>
          <p className="flex items-center gap-2">
            <Clock className="size-4 shrink-0" aria-hidden="true" />
            <span>Started {game.startedAt}</span>
          </p>
        </div>
      </div>
    </article>
  );
}
