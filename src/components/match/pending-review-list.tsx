import Link from "next/link";

export type PendingReviewMatch = {
  id: string;
  summary: string;
  details: string;
  score: string;
  format: string;
};

export function PendingReviewList({
  matches,
}: {
  matches: PendingReviewMatch[];
}) {
  return (
    <section aria-label="Pending matches" className="mx-2.5 flex flex-col gap-3">
      {matches.map((match) => (
        <Link
          key={match.id}
          href={`/matches/${match.id}/confirm`}
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
