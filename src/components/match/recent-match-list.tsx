import Link from "next/link";
import { MatchRow } from "@/components/app/match-row";
import { type AppMatchSummary } from "@/lib/app-data";

export function RecentMatchList({
  matches,
  historyHref,
}: {
  matches: AppMatchSummary[];
  historyHref: string;
}) {
  const recentMatches = matches.slice(0, 5);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">Recent Matches</h2>
        {recentMatches.length ? (
          <Link href={historyHref} className="text-sm font-semibold text-action hover:underline">
            View all
          </Link>
        ) : null}
      </div>
      {recentMatches.length ? (
        <div className="flex flex-col gap-2">
          {recentMatches.map((match) => (
            <MatchRow key={match.id} match={match} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">No matches recorded yet.</p>
      )}
    </section>
  );
}
