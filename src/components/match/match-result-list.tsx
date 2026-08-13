import Link from "next/link";
import type { MatchResultSummary } from "@/lib/matches/match-result-summary";

export type { MatchResultSummary } from "@/lib/matches/match-result-summary";

export function MatchResultList({
  matches,
  presentation = "review",
}: {
  matches: MatchResultSummary[];
  presentation?: "review" | "latest";
}) {
  if (presentation === "latest") {
    return (
      <section
        aria-label="Latest match results"
        className="flex flex-col gap-3"
      >
        {matches.map((match) => (
          <Link
            key={match.id}
            href={`/groups/${match.groupId}/matches/${match.id}`}
            className="grid min-h-[80px] w-full grid-cols-[minmax(0,1fr)_96px] items-center gap-3 rounded-lg border border-stroke bg-surface p-3 transition hover:border-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-5 text-ink">
                {match.summary}
              </p>
              <p className="mt-1 truncate text-xs leading-4 text-ink/70">
                {match.groupName}
              </p>
              <p className="truncate text-xs leading-4 text-ink/70">
                {match.submittedAt}
              </p>
            </div>
            <div className="grid min-h-14 w-24 shrink-0 place-items-center rounded-lg border border-stroke bg-surface px-2 py-2 text-center">
              <div>
                <p className="text-base font-bold leading-5 tabular-nums text-ink">
                  {match.singleGameScore ?? match.score}
                </p>
                <p className="text-xs leading-4 text-ink/70">
                  {match.format}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </section>
    );
  }

  return (
    <section aria-label="Match results" className="mx-2.5 flex flex-col gap-3">
      {matches.map((match) => (
        <Link
          key={match.id}
          href={`/groups/${match.groupId}/matches/${match.id}`}
          className="flex w-full min-h-[70px] items-center justify-between gap-3 rounded-lg border border-muted/70 bg-app-bg px-3.5 py-2 transition hover:border-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          <div className="min-w-0">
            <p className="truncate text-base font-bold leading-6 text-muted">
              {match.summary}
            </p>
            <p className="mt-0.5 truncate text-sm leading-5 text-muted">
              {match.details}
            </p>
          </div>
          <div className="grid min-h-14 min-w-[132px] shrink-0 place-items-center rounded-lg border border-stroke bg-surface px-4 py-2 text-center">
            <div>
              <p className="text-lg font-bold leading-6 tabular-nums text-action">
                {match.score}
              </p>
              <p className="text-sm leading-4 text-muted">{match.format}</p>
            </div>
          </div>
        </Link>
      ))}
    </section>
  );
}
