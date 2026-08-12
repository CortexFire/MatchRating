import Link from "next/link";
import { type AppCurrentRanking } from "@/lib/app-data";

export function CurrentRankingList({ rankings }: { rankings: AppCurrentRanking[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-ink">Current rankings</h2>
      {rankings.length ? (
        <div className="flex flex-col gap-2">
          {rankings.map((ranking) => (
            <Link
              key={ranking.groupId}
              href={`/groups/${ranking.groupId}/rankings`}
              className="flex items-center justify-between gap-4 rounded-lg border border-stroke bg-surface p-4 transition hover:border-selection-stroke focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{ranking.groupName}</span>
                <span className="mt-1 block text-xs text-muted">#{ranking.rank} of {ranking.memberCount}</span>
              </span>
              <span className="shrink-0 text-base font-bold tabular-nums text-ink">{ranking.rating}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">
          Join a group to see your rankings.
        </p>
      )}
    </section>
  );
}
