export const dynamic = "force-dynamic";

import { MobileShell } from "@/components/app/mobile-shell";
import { MatchRecorder, type InitialMatchRecording } from "@/components/match/match-recorder";
import { listGroupPlayers } from "@/lib/app-data";
import { type MatchFormat } from "@/lib/matches/validation";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function NewMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: SearchParams;
}) {
  const { groupId } = await params;
  const players = await listGroupPlayers(groupId);
  const initialMatch = parseInitialMatch(await searchParams, players.map((player) => player.id));

  return (
    <MobileShell active="Record" recordHref={`/groups/${groupId}/matches/new`}>
      <MatchRecorder groupId={groupId} players={players} initialMatch={initialMatch} />
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
