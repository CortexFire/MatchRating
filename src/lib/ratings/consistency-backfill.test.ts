import { describe, expect, test, vi } from "vitest";
import {
  enqueueGroupConsistencyRebuild,
  listConsistencyBackfillGroups,
  runConsistencyBackfill,
} from "./consistency-backfill";

function groups(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    groupId: `sentinel-group-${index}`,
    actorId: `sentinel-actor-${index}`,
  }));
}

describe("consistency backfill", () => {
  test("queries only group ID and owner actor, then maps the in-memory boundary", async () => {
    const range = vi.fn(async () => ({
      data: [{ id: "group-a", owner_user_id: "actor-a" }],
      error: null,
    }));
    const order = vi.fn(() => ({ range }));
    const select = vi.fn(() => ({ order }));
    const service = { from: vi.fn(() => ({ select })) };

    await expect(listConsistencyBackfillGroups(service as never)).resolves.toEqual([
      { groupId: "group-a", actorId: "actor-a" },
    ]);
    expect(service.from).toHaveBeenCalledWith("groups");
    expect(select).toHaveBeenCalledWith("id, owner_user_id");
  });

  test("uses the existing service-only full rebuild enqueue RPC", async () => {
    const rpc = vi.fn(async () => ({ data: "job-a", error: null }));

    await expect(enqueueGroupConsistencyRebuild({ rpc } as never, {
      groupId: "group-a",
      actorId: "actor-a",
    })).resolves.toBe("job-a");
    expect(rpc).toHaveBeenCalledWith("enqueue_rating_rebuild", {
      p_group_id: "group-a",
      p_from_match_id: null,
      p_actor: "actor-a",
    });
  });

  test("handles zero groups and drains one empty recovery batch", async () => {
    const enqueueRatingRebuild = vi.fn();
    const dispatchRecoverableRatingJobs = vi.fn(async () => []);

    await expect(runConsistencyBackfill({
      listGroups: async () => [],
      enqueueRatingRebuild,
      dispatchRecoverableRatingJobs,
    })).resolves.toEqual({ groupCount: 0, enqueuedCount: 0, dispatchedCount: 0 });
    expect(enqueueRatingRebuild).not.toHaveBeenCalled();
    expect(dispatchRecoverableRatingJobs).toHaveBeenCalledWith(25);
  });

  test("enqueues every group and drains batches until fewer than 25 entries return", async () => {
    const enqueueRatingRebuild = vi.fn(async () => "coalesced-job");
    const firstBatch = [...Array.from({ length: 24 }, (_, index) => `run-${index}`), null];
    const dispatchRecoverableRatingJobs = vi.fn()
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce(["run-25", null]);

    await expect(runConsistencyBackfill({
      listGroups: async () => groups(30),
      enqueueRatingRebuild,
      dispatchRecoverableRatingJobs,
    })).resolves.toEqual({ groupCount: 30, enqueuedCount: 30, dispatchedCount: 25 });
    expect(enqueueRatingRebuild).toHaveBeenCalledTimes(30);
    expect(dispatchRecoverableRatingJobs).toHaveBeenCalledTimes(2);
    expect(dispatchRecoverableRatingJobs).toHaveBeenNthCalledWith(1, 25);
    expect(dispatchRecoverableRatingJobs).toHaveBeenNthCalledWith(2, 25);
  });

  test("counts coalesced enqueues but excludes null dispatch results", async () => {
    const enqueueRatingRebuild = vi.fn(async () => "same-job-id");

    await expect(runConsistencyBackfill({
      listGroups: async () => groups(2),
      enqueueRatingRebuild,
      dispatchRecoverableRatingJobs: async () => [null],
    })).resolves.toEqual({ groupCount: 2, enqueuedCount: 2, dispatchedCount: 0 });
  });

  test("rejects a full no-progress dispatch batch without retrying or leaking identifiers", async () => {
    const dispatchRecoverableRatingJobs = vi.fn()
      .mockResolvedValueOnce(Array<string | null>(25).fill(null))
      .mockResolvedValueOnce(Array<string | null>(25).fill(null))
      .mockRejectedValueOnce(new Error("sentinel-job-id-must-not-escape"));

    const result = runConsistencyBackfill({
      listGroups: async () => groups(1),
      enqueueRatingRebuild: async () => "job",
      dispatchRecoverableRatingJobs,
    });

    await expect(result).rejects.toThrow("Consistency backfill dispatch made no progress");
    await expect(result).rejects.not.toThrow("sentinel-job-id-must-not-escape");
    expect(dispatchRecoverableRatingJobs).toHaveBeenCalledTimes(1);
  });

  test.each(["list", "enqueue", "dispatch"] as const)("propagates %s errors", async (stage) => {
    const failure = new Error(`${stage} failed`);
    await expect(runConsistencyBackfill({
      listGroups: async () => {
        if (stage === "list") throw failure;
        return groups(1);
      },
      enqueueRatingRebuild: async () => {
        if (stage === "enqueue") throw failure;
        return "job";
      },
      dispatchRecoverableRatingJobs: async () => {
        if (stage === "dispatch") throw failure;
        return [];
      },
    })).rejects.toThrow(`${stage} failed`);
  });
});
