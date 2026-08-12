export const dynamic = "force-dynamic";

import Link from "next/link";
import { Plus } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import { AvatarInitials } from "@/components/ui/avatar";
import { MatchResultList } from "@/components/match/match-result-list";
import { CurrentRankingList } from "@/components/rankings/current-ranking-list";
import {
  getCurrentProfile,
  listCurrentUserActiveMatchDrafts,
  listCurrentUserGroups,
  listCurrentUserMatches,
  listCurrentUserRankings,
} from "@/lib/app-data";
import { toMatchResultSummary } from "@/lib/matches/match-result-summary";

export default async function HomePage() {
  const [profile, groups, activeDrafts, latestMatches, currentRankings] = await Promise.all([
    getCurrentProfile(),
    listCurrentUserGroups(),
    listCurrentUserActiveMatchDrafts(),
    listCurrentUserMatches({ limit: 3 }),
    listCurrentUserRankings(),
  ]);
  const primaryGroup = groups[0];
  const primaryDraft = activeDrafts[0];
  const latestMatchResults = latestMatches.slice(0, 3).map(toMatchResultSummary);

  return (
    <MobileShell
      active="Home"
      recordHref={
        primaryGroup ? `/groups/${primaryGroup.id}/matches/new` : undefined
      }
    >
      <section className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted">Welcome back</p>
          <h1 className="truncate text-3xl font-bold leading-9 text-ink">
            {profile.name}
          </h1>
        </div>
        <Link
          href="/profile"
          aria-label="Open profile"
          className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          <AvatarInitials initials={profile.initials} />
        </Link>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-stroke bg-surface p-4 pt-2">
        <div>
          <h2 className="text-lg font-bold text-ink">Active match</h2>
        </div>

        {primaryDraft ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-muted">
                  {primaryDraft.groupName}
                </p>
                <p className="text-base font-bold capitalize text-ink">
                  {primaryDraft.format}
                </p>
              </div>
              <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">
                In progress
              </span>
            </div>
            <Link
              href={`/groups/${primaryDraft.groupId}/matches/new?draftId=${primaryDraft.id}`}
              className="block rounded-lg border border-stroke bg-app-bg p-4 transition hover:border-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {primaryDraft.teamA.join(" / ")} vs {primaryDraft.teamB.join(" / ")}
                  </p>
                </div>
                <p className="text-sm font-semibold text-action">
                  {primaryDraft.scores.join(", ")}
                </p>
              </div>
            </Link>
            <div className="flex justify-center">
              <Link
                href={`/groups/${primaryDraft.groupId}/matches/new?draftId=${primaryDraft.id}`}
                className="inline-flex rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white transition hover:bg-action/90"
              >
                Resume recording
              </Link>
            </div>
          </div>
        ) : (
          <span className="flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted">No active match in progress</p>
            <Link
              href={
                primaryGroup
                  ? `/groups/${primaryGroup.id}/matches/new`
                  : "/groups"
              }
              className="inline-flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white transition hover:bg-action/90"
            >
              <span className="flex size-5 items-center justify-center rounded-full border-[1.5px] border-white/80 text-white leading-none">
                <Plus className="stroke-[3] size-3" />
              </span>
              Create a match
            </Link>
          </span>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">Latest matches</h2>
          {latestMatchResults.length ? (
            <Link
              href="/matches/history"
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-action transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              View full history
            </Link>
          ) : null}
        </div>
        {latestMatchResults.length ? (
          <MatchResultList matches={latestMatchResults} presentation="latest" />
        ) : (
          <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">No matches recorded yet.</p>
        )}
      </section>

      <CurrentRankingList rankings={currentRankings} />
    </MobileShell>
  );
}
