import { mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { HistoricalMatch } from "./glicko2";
import {
  createSupabaseCalibrationHistorySource,
  loadActiveCalibrationHistories,
  runConsistencyCalibration,
  writeCalibrationArtifactAtomically,
} from "./consistency-calibration-command";
import type { ConsistencyCalibrationArtifact } from "./consistency-runtime-config";

const temporaryDirectories: string[] = [];

function syntheticHistory(): ReadonlyMap<string, readonly HistoricalMatch[]> {
  return new Map([["sentinel-group-id", [{
    id: "sentinel-match-id",
    revisionId: "sentinel-revision-id",
    submittedAt: "2026-08-20T00:00:00.000Z",
    format: "singles",
    teamAUserIds: ["sentinel-player-a"],
    teamBUserIds: ["sentinel-player-b"],
    games: [{
      gameId: "sentinel-game-id",
      gameNumber: 1,
      teamAScore: 21,
      teamBScore: 18,
      winnerTeam: "A",
    }],
  }]]]);
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("consistency calibration command", () => {
  test("bounds every active-revision REST filter to 100 IDs", async () => {
    const count = 205;
    const revisionIds = Array.from({ length: count }, (_, index) =>
      `revision-${String(index).padStart(3, "0")}`);
    const rowsByTable = {
      groups: [{ id: "group-a" }],
      matches: revisionIds.map((revisionId, index) => ({
        id: `match-${String(index).padStart(3, "0")}`,
        group_id: "group-a",
        active_revision_id: revisionId,
        submitted_at: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
      })),
      match_revisions: revisionIds.map((revisionId, index) => ({
        id: revisionId,
        match_id: `match-${String(index).padStart(3, "0")}`,
        format: "singles" as const,
      })),
      match_participants: revisionIds.flatMap((revisionId) => [
        { revision_id: revisionId, user_id: "player-a", team: "A" as const, slot: 1 },
        { revision_id: revisionId, user_id: "player-b", team: "B" as const, slot: 1 },
      ]),
      match_games: revisionIds.map((revisionId, index) => ({
        id: `game-${String(index).padStart(3, "0")}`,
        revision_id: revisionId,
        game_number: 1,
        team_a_score: 21,
        team_b_score: 18,
        winner_team: "A" as const,
      })),
    };
    const inBatchSizes = new Map<string, number[]>();
    const service = {
      from: vi.fn((table: keyof typeof rowsByTable) => {
        let filterColumn: string | undefined;
        let filterValues: readonly string[] = [];
        const query = {
          select: vi.fn(() => query),
          not: vi.fn(() => query),
          order: vi.fn(() => query),
          in: vi.fn((column: string, values: readonly string[]) => {
            filterColumn = column;
            filterValues = values;
            const sizes = inBatchSizes.get(table) ?? [];
            sizes.push(values.length);
            inBatchSizes.set(table, sizes);
            return query;
          }),
          range: vi.fn(async (from: number, to: number) => {
            const filtered = filterColumn
              ? rowsByTable[table].filter((row) =>
                filterValues.includes(String((row as unknown as Record<string, unknown>)[filterColumn!])))
              : rowsByTable[table];
            return { data: filtered.slice(from, to + 1), error: null };
          }),
        };
        return query;
      }),
    };

    const histories = await loadActiveCalibrationHistories(
      createSupabaseCalibrationHistorySource(service as never),
    );

    expect(histories.get("group-a")).toHaveLength(205);
    expect(inBatchSizes.get("match_revisions")).toEqual([100, 100, 5]);
    expect(inBatchSizes.get("match_participants")).toEqual([100, 100, 5]);
    expect(inBatchSizes.get("match_games")).toEqual([100, 100, 5]);
  });

  test("builds sorted HistoricalMatch groups from only the rows supplied by the active source", async () => {
    const source = {
      listGroups: vi.fn(async () => [{ id: "group-b" }, { id: "group-a" }]),
      listActiveMatches: vi.fn(async () => [
        { id: "match-z", group_id: "group-a", active_revision_id: "revision-z", submitted_at: "2026-08-20T00:00:00.000Z" },
        { id: "match-a", group_id: "group-a", active_revision_id: "revision-a", submitted_at: "2026-08-20T00:00:00.000Z" },
      ]),
      listRevisions: vi.fn(async () => [
        { id: "revision-z", match_id: "match-z", format: "singles" as const },
        { id: "revision-a", match_id: "match-a", format: "singles" as const },
      ]),
      listParticipants: vi.fn(async () => [
        { revision_id: "revision-a", user_id: "player-b", team: "B" as const, slot: 1 },
        { revision_id: "revision-a", user_id: "player-a", team: "A" as const, slot: 1 },
        { revision_id: "revision-z", user_id: "player-b", team: "B" as const, slot: 1 },
        { revision_id: "revision-z", user_id: "player-a", team: "A" as const, slot: 1 },
      ]),
      listGames: vi.fn(async () => [
        { id: "game-z", revision_id: "revision-z", game_number: 1, team_a_score: 18, team_b_score: 21, winner_team: "B" as const },
        { id: "game-a", revision_id: "revision-a", game_number: 1, team_a_score: 21, team_b_score: 18, winner_team: "A" as const },
      ]),
    };

    const histories = await loadActiveCalibrationHistories(source);

    expect([...histories.keys()]).toEqual(["group-a", "group-b"]);
    expect(histories.get("group-a")?.map((item) => item.id)).toEqual(["match-a", "match-z"]);
    expect(histories.get("group-a")?.[0]).toEqual({
      id: "match-a",
      revisionId: "revision-a",
      submittedAt: "2026-08-20T00:00:00.000Z",
      format: "singles",
      teamAUserIds: ["player-a"],
      teamBUserIds: ["player-b"],
      games: [{
        gameId: "game-a",
        gameNumber: 1,
        teamAScore: 21,
        teamBScore: 18,
        winnerTeam: "A",
      }],
    });
    expect(source.listRevisions).toHaveBeenCalledWith(["revision-a", "revision-z"]);
    expect(source.listParticipants).toHaveBeenCalledWith(["revision-a", "revision-z"]);
    expect(source.listGames).toHaveBeenCalledWith(["revision-a", "revision-z"]);
  });

  test("rejects incomplete active-revision row sets", async () => {
    await expect(loadActiveCalibrationHistories({
      listGroups: async () => [{ id: "group-a" }],
      listActiveMatches: async () => [
        { id: "match-a", group_id: "group-a", active_revision_id: "revision-missing", submitted_at: "2026-08-20T00:00:00.000Z" },
      ],
      listRevisions: async () => [],
      listParticipants: async () => [],
      listGames: async () => [],
    })).rejects.toThrow("Invalid active calibration rows");
  });

  test("atomically replaces the aggregate artifact without serializing identifiers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "matchrating-calibration-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "consistency-calibration.json");
    await writeFile(outputPath, "stale artifact", "utf8");
    const log = vi.fn();

    const artifact = await runConsistencyCalibration({
      loadHistories: async () => syntheticHistory(),
      outputPath,
      log,
    });

    const serialized = await readFile(outputPath, "utf8");
    expect(JSON.parse(serialized)).toEqual(artifact);
    expect(serialized).not.toContain("sentinel-");
    expect(JSON.stringify(log.mock.calls)).not.toContain("sentinel-");
    expect(await readdir(directory)).toEqual(["consistency-calibration.json"]);
  });

  test("serializes only the fixed aggregate schema even if an object has extra properties", async () => {
    const directory = await mkdtemp(join(tmpdir(), "matchrating-calibration-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "consistency-calibration.json");
    const artifact = {
      qualified: false,
      populationKappa: 200,
      priorLogSd: 0.35,
      driftLogSd: 0.02,
      groupCount: 0,
      trainingMatches: 0,
      heldOutMatches: 0,
      individualizedTrainingLogLoss: null,
      individualizedTrainingBrier: null,
      individualizedHeldOutLogLoss: null,
      individualizedHeldOutBrier: null,
      nullTrainingLogLoss: null,
      nullTrainingBrier: null,
      nullHeldOutLogLoss: null,
      nullHeldOutBrier: null,
      dataThrough: null,
      rawRows: [{ playerId: "sentinel-player-id" }],
    } as ConsistencyCalibrationArtifact;

    await writeCalibrationArtifactAtomically(outputPath, artifact);

    const serialized = await readFile(outputPath, "utf8");
    expect(serialized).not.toContain("sentinel-");
    expect(Object.keys(JSON.parse(serialized))).not.toContain("rawRows");
  });

  test("preserves the exact previous artifact when atomic rename fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "matchrating-calibration-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "consistency-calibration.json");
    const previous = "exact previous aggregate artifact\n";
    await writeFile(outputPath, previous, "utf8");
    const renameFailure = new Error("synthetic rename failure");

    await expect(writeCalibrationArtifactAtomically(outputPath, {
      qualified: false,
      populationKappa: 200,
      priorLogSd: 0.35,
      driftLogSd: 0.02,
      groupCount: 0,
      trainingMatches: 0,
      heldOutMatches: 0,
      individualizedTrainingLogLoss: null,
      individualizedTrainingBrier: null,
      individualizedHeldOutLogLoss: null,
      individualizedHeldOutBrier: null,
      nullTrainingLogLoss: null,
      nullTrainingBrier: null,
      nullHeldOutLogLoss: null,
      nullHeldOutBrier: null,
      dataThrough: null,
    }, {
      writeFile,
      rename: vi.fn(async () => {
        throw renameFailure;
      }) as typeof rename,
      rm,
    })).rejects.toBe(renameFailure);

    expect(await readFile(outputPath, "utf8")).toBe(previous);
    expect(await readdir(directory)).toEqual(["consistency-calibration.json"]);
  });
});
