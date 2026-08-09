import { beforeEach, describe, expect, test, vi } from "vitest";
import * as actions from "@/app/actions";

const nextServerMocks = vi.hoisted(() => ({
  after: vi.fn(),
}));

const dispatchMocks = vi.hoisted(() => ({
  dispatchRatingRebuild: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  rpc: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => nextServerMocks);
vi.mock("@/lib/ratings/rebuild-dispatch", () => dispatchMocks);
vi.mock("@/lib/supabase/server", () => supabaseMocks);

describe("transactional match actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.requireUserId.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    supabaseMocks.createSupabaseServerClient.mockResolvedValue({ rpc: supabaseMocks.rpc });
    supabaseMocks.createSupabaseServiceClient.mockReturnValue({});
    supabaseMocks.rpc.mockResolvedValue({
      data: {
        matchId: "22222222-2222-4222-8222-222222222222",
        revisionId: "33333333-3333-4333-8333-333333333333",
        ratingJobId: "44444444-4444-4444-8444-444444444444",
        ratingStatus: "queued",
      },
      error: null,
    });
  });

  test("returns a committed match when post-response rating dispatch fails", async () => {
    const scheduled: Array<() => void | Promise<void>> = [];
    nextServerMocks.after.mockImplementation((callback: () => void | Promise<void>) => {
      scheduled.push(callback);
    });
    dispatchMocks.dispatchRatingRebuild.mockRejectedValue(new Error("workflow unavailable"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await actions.submitMatch({
      commandId: "55555555-5555-4555-8555-555555555555",
      groupId: "66666666-6666-4666-8666-666666666666",
      format: "singles",
      teamAUserIds: ["11111111-1111-4111-8111-111111111111"],
      teamBUserIds: ["77777777-7777-4777-8777-777777777777"],
      games: [{ teamAScore: 21, teamBScore: 18 }],
    });

    expect(result).toEqual({
      ok: true,
      data: {
        matchId: "22222222-2222-4222-8222-222222222222",
        revisionId: "33333333-3333-4333-8333-333333333333",
        ratingJobId: "44444444-4444-4444-8444-444444444444",
        ratingStatus: "queued",
      },
    });
    expect(scheduled).toHaveLength(1);
    await expect(scheduled[0]()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith("rating_dispatch_failed", {
      jobId: "44444444-4444-4444-8444-444444444444",
      error: "workflow unavailable",
    });
    errorSpy.mockRestore();
  });

  test("returns a committed match when post-response scheduling fails", async () => {
    nextServerMocks.after.mockImplementation(() => {
      throw new Error("request context unavailable");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await actions.submitMatch({
      commandId: "55555555-5555-4555-8555-555555555555",
      groupId: "66666666-6666-4666-8666-666666666666",
      format: "singles",
      teamAUserIds: ["11111111-1111-4111-8111-111111111111"],
      teamBUserIds: ["77777777-7777-4777-8777-777777777777"],
      games: [{ teamAScore: 21, teamBScore: 18 }],
    });

    expect(result.ok).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith("rating_dispatch_schedule_failed", {
      jobId: "44444444-4444-4444-8444-444444444444",
      error: "request context unavailable",
    });
    errorSpy.mockRestore();
  });

  test("rejects match submission without a client command ID", async () => {
    const result = await actions.submitMatch({
      groupId: "66666666-6666-4666-8666-666666666666",
      format: "singles",
      teamAUserIds: ["11111111-1111-4111-8111-111111111111"],
      teamBUserIds: ["77777777-7777-4777-8777-777777777777"],
      games: [{ teamAScore: 21, teamBScore: 18 }],
    } as Parameters<typeof actions.submitMatch>[0]);

    expect(result).toEqual({ ok: false, message: "A command ID is required." });
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  test("rejects a submission when its editable draft belongs to another group", async () => {
    const editableDraft = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    editableDraft.select.mockReturnValue(editableDraft);
    editableDraft.eq.mockReturnValue(editableDraft);
    editableDraft.maybeSingle.mockResolvedValue({
      data: {
        id: "33333333-3333-4333-8333-333333333333",
        group_id: "77777777-7777-4777-8777-777777777777",
        created_by_user_id: "11111111-1111-4111-8111-111111111111",
        expires_at: "2099-01-01T00:00:00.000Z",
        submitted_match_id: null,
      },
      error: null,
    });
    supabaseMocks.createSupabaseServiceClient.mockReturnValue({ from: vi.fn(() => editableDraft) });

    const result = await actions.submitMatch({
      commandId: "55555555-5555-4555-8555-555555555555",
      draftId: "33333333-3333-4333-8333-333333333333",
      groupId: "66666666-6666-4666-8666-666666666666",
      format: "singles",
      teamAUserIds: ["11111111-1111-4111-8111-111111111111"],
      teamBUserIds: ["77777777-7777-4777-8777-777777777777"],
      games: [{ teamAScore: 21, teamBScore: 18 }],
    });

    expect(result).toEqual({ ok: false, message: "This active match belongs to another group." });
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  test("forwards the client command ID when confirming a revision", async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: { revisionId: "33333333-3333-4333-8333-333333333333" },
      error: null,
    });
    const confirm = actions.confirmMatchRevision as unknown as (input: {
      revisionId: string;
      commandId: string;
    }) => ReturnType<typeof actions.confirmMatchRevision>;

    const result = await confirm({
      revisionId: "33333333-3333-4333-8333-333333333333",
      commandId: "88888888-8888-4888-8888-888888888888",
    });

    expect(result).toEqual({
      ok: true,
      data: { revisionId: "33333333-3333-4333-8333-333333333333" },
    });
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("command_review_match", {
      p_command_id: "88888888-8888-4888-8888-888888888888",
      p_revision_id: "33333333-3333-4333-8333-333333333333",
      p_action: "confirmed",
    });
  });

  test("disputes a revision without sending free-text metadata", async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: { revisionId: "33333333-3333-4333-8333-333333333333" },
      error: null,
    });

    const result = await actions.disputeMatchRevision({
      revisionId: "33333333-3333-4333-8333-333333333333",
      commandId: "88888888-8888-4888-8888-888888888888",
    });

    expect(result.ok).toBe(true);
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("command_review_match", {
      p_command_id: "88888888-8888-4888-8888-888888888888",
      p_revision_id: "33333333-3333-4333-8333-333333333333",
      p_action: "disputed",
    });
  });

  test("atomically disputes and revises without free-text metadata", async () => {
    const result = await actions.disputeAndReviseMatch({
      commandId: "88888888-8888-4888-8888-888888888888",
      groupId: "66666666-6666-4666-8666-666666666666",
      matchId: "22222222-2222-4222-8222-222222222222",
      expectedRevisionId: "33333333-3333-4333-8333-333333333333",
      format: "singles",
      teamAUserIds: ["11111111-1111-4111-8111-111111111111"],
      teamBUserIds: ["77777777-7777-4777-8777-777777777777"],
      games: [{ teamAScore: 21, teamBScore: 18 }],
    });

    expect(result.ok).toBe(true);
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("command_dispute_and_revise_match", {
      p_command_id: "88888888-8888-4888-8888-888888888888",
      p_match_id: "22222222-2222-4222-8222-222222222222",
      p_expected_revision_id: "33333333-3333-4333-8333-333333333333",
      p_format: "singles",
      p_team_a: ["11111111-1111-4111-8111-111111111111"],
      p_team_b: ["77777777-7777-4777-8777-777777777777"],
      p_games: [{ teamAScore: 21, teamBScore: 18 }],
    });
  });

  test("queues an admin retry with the supplied command ID", async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: {
        ratingJobId: "44444444-4444-4444-8444-444444444444",
        ratingStatus: "queued",
      },
      error: null,
    });
    const retry = (
      actions as typeof actions & {
        retryRatingRebuild: (input: { jobId: string; commandId: string }) => Promise<actions.ActionResult>;
      }
    ).retryRatingRebuild;

    const result = await retry({
      jobId: "44444444-4444-4444-8444-444444444444",
      commandId: "99999999-9999-4999-8999-999999999999",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        ratingJobId: "44444444-4444-4444-8444-444444444444",
        ratingStatus: "queued",
      },
    });
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("retry_rating_rebuild", {
      p_command_id: "99999999-9999-4999-8999-999999999999",
      p_job_id: "44444444-4444-4444-8444-444444444444",
    });
  });
});
