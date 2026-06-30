export const dynamic = "force-dynamic";

import Link from "next/link";
import { ChevronRight, UsersRound, Plus } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import { AvatarInitials } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { PendingReviewList } from "@/components/match/pending-review-list";
import { getCurrentProfile, listCurrentUserGroups } from "@/lib/app-data";
import {
  getCurrentGames,
  getPendingReviewMatches,
  getPrimaryCurrentGame,
  splitCurrentGameTeams,
  toPendingReviewSummary,
} from "@/lib/home";
import { demoCurrentGames, demoMatches } from "@/lib/demo-data";

export default async function HomePage() {
  const [profile, groups] = await Promise.all([
    getCurrentProfile(),
    listCurrentUserGroups(),
  ]);
  const primaryGroup = groups[0];
  const activeGames = getCurrentGames(demoCurrentGames);
  const primaryGame = getPrimaryCurrentGame(demoCurrentGames);
  const primaryTeams = primaryGame ? splitCurrentGameTeams(primaryGame) : null;
  const pendingReviewMatches = getPendingReviewMatches(demoMatches).map(
    toPendingReviewSummary,
  );

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

        {primaryGame ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-muted">
                  {primaryGame.groupName}
                </p>
                <p className="text-base font-bold text-ink">
                  {primaryGame.startedAt}
                </p>
              </div>
              <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">
                In progress
              </span>
            </div>
            <div className="rounded-lg border border-stroke bg-app-bg p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {primaryTeams?.teamA.join(" / ")}
                  </p>
                  <p className="mt-1 truncate text-sm text-muted">
                    vs {primaryTeams?.teamB.join(" / ")}
                  </p>
                </div>
                <p className="text-sm font-semibold text-action">
                  {primaryGame.scores?.join(", ") ?? "Live"}
                </p>
              </div>
            </div>
            <div className="flex justify-center">
              <Link
                href={
                  primaryGroup
                    ? `/groups/${primaryGroup.id}/matches/new`
                    : "/groups"
                }
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

      <section className="flex flex-col gap-3 rounded-lg border border-stroke bg-surface p-2 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ink pl-2">Pending review</h2>
          </div>
          <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">
            {pendingReviewMatches.length} waiting
          </span>
        </div>

        {pendingReviewMatches.length ? (
          <PendingReviewList matches={pendingReviewMatches} />
        ) : (
          <span className="flex flex-col items-center p-6">
            <p className="text-sm text-muted">No matches pending review</p>
          </span>
        )}
      </section>
    </MobileShell>
  );
}
