export const unstable_instant = {
  prefetch: "static",
  samples: [{
    params: { groupId: "00000000-0000-0000-0000-000000000000" },
    searchParams: { draftId: null },
  }],
};

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createGuestPlayers, saveActiveMatchDraft, submitMatch } from "@/app/actions";
import { MobileShell } from "@/components/app/mobile-shell";
import { MatchRecorder, type InitialMatchRecording } from "@/components/match/match-recorder";
import { RatingRebuildStatus } from "@/components/match/rating-rebuild-status";
import { type MatchFormat } from "@/lib/matches/validation";
import { getMatchRecorderPageData } from "@/lib/navigation-read-models";
import GroupMatchLoading from "../loading";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type NewMatchPageProps = {
  params: Promise<{ groupId: string }>;
  searchParams: SearchParams;
};

export default function NewMatchPage(props: NewMatchPageProps) {
  return (
    <Suspense fallback={<GroupMatchLoading />}>
      <NewMatchContent {...props} />
    </Suspense>
  );
}

export async function NewMatchContent({ params, searchParams }: NewMatchPageProps) {
  const { groupId } = await params;
  const resolvedSearchParams = await searchParams;
  const draftId = firstValue(resolvedSearchParams.draftId);
  const data = await getMatchRecorderPageData(groupId, draftId);
  if (!data) notFound();
  const { group, groups, players, draft, ratingStatus } = data;
  const initialMatch = draft?.initialMatch ?? parseInitialMatch(resolvedSearchParams, players.map((player) => player.id));

  return (
    <MobileShell active="Record" recordHref={`/groups/${groupId}/matches/new`}>
      <RatingRebuildStatus
        key={ratingStatus.id ?? "no-rating-job"}
        groupId={groupId}
        jobId={ratingStatus.id}
        status={ratingStatus.status}
        canRetry={ratingStatus.canRetry}
        showPending={false}
      />
      {draftId && !draft ? (
        <section className="flex min-h-full flex-col gap-4">
          <h1 className="text-[22px] font-bold leading-7 text-ink">Active match expired</h1>
          <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">This active match expired. Start a new match.</p>
          <Link className="inline-flex min-h-11 items-center justify-center rounded-lg bg-action px-4 text-sm font-semibold text-white" href={`/groups/${groupId}/matches/new`}>
            Start a new match
          </Link>
        </section>
      ) : (
        <MatchRecorder
          key={groupId}
          groupId={groupId}
          groupName={group.name}
          groupOptions={groups.map(({ id, name }) => ({ id, name }))}
          players={players}
          initialMatch={initialMatch}
          draftId={draft?.id}
          canEdit={draft?.canEdit ?? true}
          createGuestPlayers={createGuestPlayers}
          saveActiveMatchDraft={saveActiveMatchDraft}
          submitMatchAction={submitMatch}
        />
      )}
    </MobileShell>
  );
}

function parseInitialMatch(
  params: Awaited<SearchParams>,
  validPlayerIds: string[],
): InitialMatchRecording | undefined {
  const format = parseFormat(firstValue(params.format));
  const teamAUserIds = parsePlayerIds(firstValue(params.teamA), format, validPlayerIds);
  const teamBUserIds = parsePlayerIds(firstValue(params.teamB), format, validPlayerIds);
  const games = parseScores(firstValue(params.scores));

  if (!format || !teamAUserIds || !teamBUserIds || games.length === 0) {
    return undefined;
  }

  return {
    format,
    teamAUserIds,
    teamBUserIds,
    games,
  };
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseFormat(value: string | undefined): MatchFormat | undefined {
  return value === "singles" || value === "doubles" ? value : undefined;
}

function parsePlayerIds(
  value: string | undefined,
  format: MatchFormat | undefined,
  validPlayerIds: string[],
) {
  if (!value || !format) {
    return undefined;
  }

  const validPlayers = new Set(validPlayerIds);
  const expectedCount = format === "singles" ? 1 : 2;
  const playerIds = value.split(",").filter((playerId) => validPlayers.has(playerId));

  return playerIds.length === expectedCount ? playerIds : undefined;
}

function parseScores(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((score) => {
      const [teamAScore, teamBScore] = score.split("-").map(Number);

      if (!Number.isInteger(teamAScore) || !Number.isInteger(teamBScore)) {
        return undefined;
      }

      return { teamAScore, teamBScore };
    })
    .filter((score): score is { teamAScore: number; teamBScore: number } => Boolean(score));
}
