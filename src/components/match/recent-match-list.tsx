import Link from "next/link";
import { MatchRow } from "@/components/app/match-row";
import { type AppMatchSummary } from "@/lib/app-data";

export function RecentMatchList({
  matches,
  historyHref,
  title = "Recent Matches",
  limit = 5,
  linkLabel = "View all",
  showGroupName = false,
}: {
  matches: AppMatchSummary[];
  historyHref: string;
  title?: string;
  limit?: number;
  linkLabel?: string;
  showGroupName?: boolean;
}) {
  const recentMatches = matches.slice(0, limit);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        {recentMatches.length ? (
          <Link href={historyHref} className="text-sm font-semibold text-action hover:underline">
            {linkLabel}
          </Link>
        ) : null}
      </div>
      {recentMatches.length ? (
        <div className="flex flex-col gap-2">
          {recentMatches.map((match) => (
            <MatchRow key={match.id} match={match} showGroupName={showGroupName} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">No matches recorded yet.</p>
      )}
    </section>
  );
}
