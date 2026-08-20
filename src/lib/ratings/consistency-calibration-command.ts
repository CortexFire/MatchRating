import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { createSupabaseServiceClient } from "../supabase/server";
import { calibrateConsistency } from "./consistency-calibration";
import type { HistoricalMatch } from "./glicko2";
import type { ConsistencyCalibrationArtifact } from "./consistency-runtime-config";

type GroupRow = { id: string };
type MatchRow = {
  id: string;
  group_id: string;
  active_revision_id: string;
  submitted_at: string;
};
type RevisionRow = {
  id: string;
  match_id: string;
  format: "singles" | "doubles";
};
type ParticipantRow = {
  revision_id: string;
  user_id: string;
  team: "A" | "B";
  slot: number;
};
type GameRow = {
  id: string;
  revision_id: string;
  game_number: number;
  team_a_score: number;
  team_b_score: number;
  winner_team: "A" | "B";
};

export type CalibrationHistorySource = {
  listGroups(): Promise<GroupRow[]>;
  listActiveMatches(): Promise<MatchRow[]>;
  listRevisions(revisionIds: string[]): Promise<RevisionRow[]>;
  listParticipants(revisionIds: string[]): Promise<ParticipantRow[]>;
  listGames(revisionIds: string[]): Promise<GameRow[]>;
};

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;
const PAGE_SIZE = 1_000;
const REVISION_BATCH_SIZE = 500;

async function collectPages<T>(
  loadPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export function createSupabaseCalibrationHistorySource(
  service: ServiceClient,
): CalibrationHistorySource {
  return {
    listGroups: () => collectPages(async (from, to) => {
      const { data, error } = await service
        .from("groups")
        .select("id")
        .order("id", { ascending: true })
        .range(from, to);
      return { data: data as GroupRow[] | null, error };
    }),
    listActiveMatches: () => collectPages(async (from, to) => {
      const { data, error } = await service
        .from("matches")
        .select("id, group_id, active_revision_id, submitted_at")
        .not("active_revision_id", "is", null)
        .order("group_id", { ascending: true })
        .order("submitted_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return { data: data as MatchRow[] | null, error };
    }),
    listRevisions: (revisionIds) => collectPages(async (from, to) => {
      const { data, error } = await service
        .from("match_revisions")
        .select("id, match_id, format")
        .in("id", revisionIds)
        .order("id", { ascending: true })
        .range(from, to);
      return { data: data as RevisionRow[] | null, error };
    }),
    listParticipants: (revisionIds) => collectPages(async (from, to) => {
      const { data, error } = await service
        .from("match_participants")
        .select("revision_id, user_id, team, slot")
        .in("revision_id", revisionIds)
        .order("revision_id", { ascending: true })
        .order("team", { ascending: true })
        .order("slot", { ascending: true })
        .range(from, to);
      return { data: data as ParticipantRow[] | null, error };
    }),
    listGames: (revisionIds) => collectPages(async (from, to) => {
      const { data, error } = await service
        .from("match_games")
        .select("id, revision_id, game_number, team_a_score, team_b_score, winner_team")
        .in("revision_id", revisionIds)
        .order("revision_id", { ascending: true })
        .order("game_number", { ascending: true })
        .range(from, to);
      return { data: data as GameRow[] | null, error };
    }),
  };
}

function invalidActiveRows(): never {
  throw new Error("Invalid active calibration rows");
}

function uniqueMap<T extends { id: string }>(rows: readonly T[]) {
  const result = new Map<string, T>();
  for (const row of rows) {
    if (!row.id || result.has(row.id)) invalidActiveRows();
    result.set(row.id, row);
  }
  return result;
}

export async function loadActiveCalibrationHistories(
  source: CalibrationHistorySource,
): Promise<ReadonlyMap<string, readonly HistoricalMatch[]>> {
  const [groupRows, matchRows] = await Promise.all([
    source.listGroups(),
    source.listActiveMatches(),
  ]);
  const groupsById = uniqueMap(groupRows);
  const matchesById = uniqueMap(matchRows);
  const revisionIds = [...new Set(matchRows.map((match) => match.active_revision_id))].sort();
  const revisionRows: RevisionRow[] = [];
  const participantRows: ParticipantRow[] = [];
  const gameRows: GameRow[] = [];
  for (let start = 0; start < revisionIds.length; start += REVISION_BATCH_SIZE) {
    const batch = revisionIds.slice(start, start + REVISION_BATCH_SIZE);
    const [revisions, participants, games] = await Promise.all([
      source.listRevisions(batch),
      source.listParticipants(batch),
      source.listGames(batch),
    ]);
    revisionRows.push(...revisions);
    participantRows.push(...participants);
    gameRows.push(...games);
  }

  const revisionsById = uniqueMap(revisionRows);
  const activeRevisionIds = new Set(revisionIds);
  if (
    matchesById.size !== matchRows.length
    || revisionRows.some((revision) => !activeRevisionIds.has(revision.id))
    || participantRows.some((participant) => !activeRevisionIds.has(participant.revision_id))
    || gameRows.some((game) => !activeRevisionIds.has(game.revision_id))
  ) {
    invalidActiveRows();
  }

  const histories = new Map<string, HistoricalMatch[]>(
    [...groupsById.keys()].sort().map((groupId) => [groupId, []]),
  );
  for (const match of matchRows) {
    const revision = revisionsById.get(match.active_revision_id);
    const groupHistory = histories.get(match.group_id);
    if (
      !match.id
      || !match.active_revision_id
      || !Number.isFinite(Date.parse(match.submitted_at))
      || !revision
      || revision.match_id !== match.id
      || !groupHistory
    ) {
      invalidActiveRows();
    }
    const participants = participantRows
      .filter((participant) => participant.revision_id === revision.id)
      .sort((left, right) => left.team.localeCompare(right.team) || left.slot - right.slot);
    const games = gameRows
      .filter((game) => game.revision_id === revision.id)
      .sort((left, right) => left.game_number - right.game_number);
    const historicalMatch: HistoricalMatch = {
      id: match.id,
      revisionId: revision.id,
      submittedAt: match.submitted_at,
      format: revision.format,
      teamAUserIds: participants
        .filter((participant) => participant.team === "A")
        .map((participant) => participant.user_id),
      teamBUserIds: participants
        .filter((participant) => participant.team === "B")
        .map((participant) => participant.user_id),
      games: games.map((game) => ({
        gameId: game.id,
        gameNumber: game.game_number,
        teamAScore: game.team_a_score,
        teamBScore: game.team_b_score,
        winnerTeam: game.winner_team,
      })),
    };
    groupHistory.push(historicalMatch);
  }

  for (const history of histories.values()) {
    history.sort((left, right) => {
      const timeDifference = Date.parse(left.submittedAt) - Date.parse(right.submittedAt);
      return timeDifference === 0 ? left.id.localeCompare(right.id) : timeDifference;
    });
  }
  return histories;
}

function aggregateArtifact(artifact: ConsistencyCalibrationArtifact): ConsistencyCalibrationArtifact {
  return {
    qualified: artifact.qualified,
    populationKappa: artifact.populationKappa,
    priorLogSd: artifact.priorLogSd,
    driftLogSd: artifact.driftLogSd,
    groupCount: artifact.groupCount,
    trainingMatches: artifact.trainingMatches,
    heldOutMatches: artifact.heldOutMatches,
    individualizedTrainingLogLoss: artifact.individualizedTrainingLogLoss,
    individualizedTrainingBrier: artifact.individualizedTrainingBrier,
    individualizedHeldOutLogLoss: artifact.individualizedHeldOutLogLoss,
    individualizedHeldOutBrier: artifact.individualizedHeldOutBrier,
    nullTrainingLogLoss: artifact.nullTrainingLogLoss,
    nullTrainingBrier: artifact.nullTrainingBrier,
    nullHeldOutLogLoss: artifact.nullHeldOutLogLoss,
    nullHeldOutBrier: artifact.nullHeldOutBrier,
    dataThrough: artifact.dataThrough,
  };
}

export async function writeCalibrationArtifactAtomically(
  outputPath: string,
  artifact: ConsistencyCalibrationArtifact,
) {
  const serialized = `${JSON.stringify(aggregateArtifact(artifact), null, 2)}\n`;
  const temporaryPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let replaced = false;
  try {
    await writeFile(temporaryPath, serialized, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, outputPath);
    replaced = true;
  } finally {
    if (!replaced) await rm(temporaryPath, { force: true });
  }
}

export async function runConsistencyCalibration({
  loadHistories,
  outputPath,
  log = console.log,
}: {
  loadHistories(): Promise<ReadonlyMap<string, readonly HistoricalMatch[]>>;
  outputPath: string;
  log?: (summary: string) => void;
}) {
  const artifact = calibrateConsistency(await loadHistories());
  await writeCalibrationArtifactAtomically(outputPath, artifact);
  log(JSON.stringify(aggregateArtifact(artifact)));
  return artifact;
}
