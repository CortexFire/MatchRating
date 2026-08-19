import { beforeEach, describe, expect, test, vi } from "vitest";
import * as actions from "@/app/actions";

const nextServerMocks = vi.hoisted(() => ({
  after: vi.fn(),
}));

const dispatchMocks = vi.hoisted(() => ({
  dispatchRatingRebuild: vi.fn(),
}));

const nextCacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  requireAuthenticatedSupabaseClient: vi.fn(),
  requireUserId: vi.fn(),
  rpc: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock("next/cache", () => nextCacheMocks);
vi.mock("next/server", () => nextServerMocks);
vi.mock("@/lib/ratings/rebuild-dispatch", () => dispatchMocks);
vi.mock("@/lib/supabase/server", () => supabaseMocks);

function draftService({
  draft,
  activeMemberIds,
  updatedDraftId = draft.id,
  deletedDraftId = draft.id,
}: {
  draft: {
    id: string;
    group_id: string;
    created_by_user_id: string;
    team_a_user_ids: string[];
    team_b_user_ids: string[];
    expires_at: string;
    submitted_match_id: string | null;
    updated_at?: string;
  };
  activeMemberIds: string[];
  updatedDraftId?: string | null;
  deletedDraftId?: string | null;
}) {
  const update = vi.fn();
  const deleteDraft = vi.fn();
  const draftEq = vi.fn();
  const draftIs = vi.fn();
  const from = vi.fn((table: string) => {
    if (table === "group_memberships") {
      let selection = "";
      const query = {
        select: vi.fn((value: string) => {
          selection = value;
          return query;
        }),
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: { id: "membership-1", role: "member" }, error: null })),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          resolve({
            data: selection === "user_id" ? activeMemberIds.map((user_id) => ({ user_id })) : [],
            error: null,
          }),
      };
      return query;
    }

    let isUpdate = false;
    let isDelete = false;
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        draftEq(column, value);
        return query;
      }),
      is: vi.fn((column: string, value: unknown) => {
        draftIs(column, value);
        return query;
      }),
      gt: vi.fn(() => query),
      or: vi.fn(() => query),
      update: vi.fn((values: unknown) => {
        isUpdate = true;
        update(values);
        return query;
      }),
      delete: vi.fn(() => {
        isDelete = true;
        deleteDraft();
        return query;
      }),
      maybeSingle: vi.fn(async () => ({
        data: isUpdate
          ? (updatedDraftId ? { id: updatedDraftId } : null)
          : isDelete
            ? (deletedDraftId ? { id: deletedDraftId } : null)
            : draft,
        error: null,
      })),
      single: vi.fn(async () => ({
        data: isUpdate
          ? (updatedDraftId ? { id: updatedDraftId } : null)
          : isDelete
            ? (deletedDraftId ? { id: deletedDraftId } : null)
            : draft,
        error: null,
      })),
      then: (resolve: (value: { data: null; error: null }) => unknown) => resolve({ data: null, error: null }),
    };
    return query;
  });

  return { service: { from }, update, deleteDraft, draftEq, draftIs };
}

describe("transactional match actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.requireUserId.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    supabaseMocks.createSupabaseServerClient.mockResolvedValue({ rpc: supabaseMocks.rpc });
    supabaseMocks.requireAuthenticatedSupabaseClient.mockResolvedValue({
      client: { rpc: supabaseMocks.rpc },
      userId: "11111111-1111-4111-8111-111111111111",
    });
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

  test("forwards the selected winner with a submitted game", async () => {
    await actions.submitMatch({
      commandId: "55555555-5555-4555-8555-555555555555",
      groupId: "66666666-6666-4666-8666-666666666666",
      format: "singles",
      teamAUserIds: ["11111111-1111-4111-8111-111111111111"],
      teamBUserIds: ["77777777-7777-4777-8777-777777777777"],
      games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "B" }],
    });

    expect(supabaseMocks.rpc).toHaveBeenCalledWith("command_submit_match", expect.objectContaining({
      p_games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "B" }],
    }));
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
      games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
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
      games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
    });

    expect(result.ok).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith("rating_dispatch_schedule_failed", {
      jobId: "44444444-4444-4444-8444-444444444444",
      error: "request context unavailable",
    });
    errorSpy.mockRestore();
  });

  test("invalidates rating-bearing group views without revalidating the active recorder", async () => {
    const groupId = "66666666-6666-4666-8666-666666666666";
    nextServerMocks.after.mockImplementation(() => undefined);

    const result = await actions.submitMatch({
      commandId: "55555555-5555-4555-8555-555555555555",
      groupId,
      format: "singles",
      teamAUserIds: ["11111111-1111-4111-8111-111111111111"],
      teamBUserIds: ["77777777-7777-4777-8777-777777777777"],
      games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
    });

    expect(result.ok).toBe(true);
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith(`/groups/${groupId}`);
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith(`/groups/${groupId}/members`);
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith(`/groups/${groupId}/rankings`);
    expect(nextCacheMocks.revalidatePath).not.toHaveBeenCalledWith(`/groups/${groupId}/matches/new`);
  });

  test("rejects match submission without a client command ID", async () => {
    const result = await actions.submitMatch({
      groupId: "66666666-6666-4666-8666-666666666666",
      format: "singles",
      teamAUserIds: ["11111111-1111-4111-8111-111111111111"],
      teamBUserIds: ["77777777-7777-4777-8777-777777777777"],
      games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
    } as Parameters<typeof actions.submitMatch>[0]);

    expect(result).toEqual({ ok: false, message: "A command ID is required." });
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  test("allows a stored participant to update a shared draft without replacing its creator", async () => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const creator = "22222222-2222-4222-8222-222222222222";
    const opponent = "77777777-7777-4777-8777-777777777777";
    const groupId = "66666666-6666-4666-8666-666666666666";
    const { service, update } = draftService({
      draft: {
        id: "33333333-3333-4333-8333-333333333333",
        group_id: groupId,
        created_by_user_id: creator,
        team_a_user_ids: [actor],
        team_b_user_ids: [opponent],
        expires_at: "2099-01-01T00:00:00.000Z",
        submitted_match_id: null,
      },
      activeMemberIds: [actor, creator, opponent],
    });
    supabaseMocks.createSupabaseServiceClient.mockReturnValue(service);

    const result = await actions.saveActiveMatchDraft({
      draftId: "33333333-3333-4333-8333-333333333333",
      groupId,
      format: "singles",
      teamAUserIds: [actor],
      teamBUserIds: [opponent],
      games: [{ teamAScore: 21, teamBScore: 19, winnerTeam: "A" }],
    });

    expect(result).toEqual({
      ok: true,
      data: { draftId: "33333333-3333-4333-8333-333333333333" },
    });
    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({ created_by_user_id: expect.anything() }));
  });

  test("does not create a draft when a fresh recorder has no players or scores", async () => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const groupId = "66666666-6666-4666-8666-666666666666";
    const { service } = draftService({
      draft: {
        id: "33333333-3333-4333-8333-333333333333",
        group_id: groupId,
        created_by_user_id: actor,
        team_a_user_ids: [],
        team_b_user_ids: [],
        expires_at: "2099-01-01T00:00:00.000Z",
        submitted_match_id: null,
      },
      activeMemberIds: [actor],
    });
    supabaseMocks.createSupabaseServiceClient.mockReturnValue(service);

    const result = await actions.syncActiveMatchDraft({
      groupId,
      format: "singles",
      teamAUserIds: [],
      teamBUserIds: [],
      games: [{ teamAScore: null, teamBScore: null, winnerTeam: "A" }],
    });

    expect(result).toEqual({
      ok: true,
      data: { draftId: null, outcome: "unchanged" },
    });
  });

  test("updates a partial draft with nullable scores", async () => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const groupId = "66666666-6666-4666-8666-666666666666";
    const draftId = "33333333-3333-4333-8333-333333333333";
    const { service, update } = draftService({
      draft: {
        id: draftId,
        group_id: groupId,
        created_by_user_id: actor,
        team_a_user_ids: [actor],
        team_b_user_ids: [],
        expires_at: "2099-01-01T00:00:00.000Z",
        submitted_match_id: null,
      },
      activeMemberIds: [actor],
    });
    supabaseMocks.createSupabaseServiceClient.mockReturnValue(service);

    const result = await actions.syncActiveMatchDraft({
      draftId,
      groupId,
      format: "doubles",
      teamAUserIds: [actor],
      teamBUserIds: [],
      games: [{ teamAScore: 21, teamBScore: null, winnerTeam: "A" }],
    });

    expect(result).toEqual({ ok: true, data: { draftId, outcome: "saved" } });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      team_a_user_ids: [actor],
      team_b_user_ids: [],
      games: [{ teamAScore: 21, teamBScore: null, winnerTeam: "A" }],
    }));
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith("/home");
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith(`/groups/${groupId}`);
  });

  test.each([
    {
      name: "roster-only",
      teamAUserIds: ["11111111-1111-4111-8111-111111111111"],
      games: [{ teamAScore: null, teamBScore: null, winnerTeam: "A" as const }],
    },
    {
      name: "score-only",
      teamAUserIds: [],
      games: [{ teamAScore: 21, teamBScore: null, winnerTeam: "A" as const }],
    },
  ])("preserves a $name draft", async ({ teamAUserIds, games }) => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const groupId = "66666666-6666-4666-8666-666666666666";
    const draftId = "33333333-3333-4333-8333-333333333333";
    const { service, update } = draftService({
      draft: {
        id: draftId,
        group_id: groupId,
        created_by_user_id: actor,
        team_a_user_ids: [actor],
        team_b_user_ids: [],
        expires_at: "2099-01-01T00:00:00.000Z",
        submitted_match_id: null,
      },
      activeMemberIds: [actor],
    });
    supabaseMocks.createSupabaseServiceClient.mockReturnValue(service);

    const result = await actions.syncActiveMatchDraft({
      draftId,
      groupId,
      format: "singles",
      teamAUserIds,
      teamBUserIds: [],
      games,
    });

    expect(result).toEqual({ ok: true, data: { draftId, outcome: "saved" } });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      team_a_user_ids: teamAUserIds,
      games,
    }));
  });

  test("deletes a completely blank existing draft at its observed update version", async () => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const groupId = "66666666-6666-4666-8666-666666666666";
    const draftId = "33333333-3333-4333-8333-333333333333";
    const updatedAt = "2026-08-19T12:00:00.000Z";
    const { service, deleteDraft, draftEq } = draftService({
      draft: {
        id: draftId,
        group_id: groupId,
        created_by_user_id: actor,
        team_a_user_ids: [actor],
        team_b_user_ids: [],
        expires_at: "2099-01-01T00:00:00.000Z",
        submitted_match_id: null,
        updated_at: updatedAt,
      },
      activeMemberIds: [actor],
    });
    supabaseMocks.createSupabaseServiceClient.mockReturnValue(service);

    const result = await actions.syncActiveMatchDraft({
      draftId,
      groupId,
      format: "singles",
      teamAUserIds: [],
      teamBUserIds: [],
      games: [{ teamAScore: null, teamBScore: null, winnerTeam: "B" }],
    });

    expect(result).toEqual({ ok: true, data: { draftId: null, outcome: "deleted" } });
    expect(deleteDraft).toHaveBeenCalledOnce();
    expect(draftEq).toHaveBeenCalledWith("updated_at", updatedAt);
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith("/home");
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith(`/groups/${groupId}`);
  });

  test("rejects blank deletion when a newer draft version wins the race", async () => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const groupId = "66666666-6666-4666-8666-666666666666";
    const draftId = "33333333-3333-4333-8333-333333333333";
    const { service } = draftService({
      draft: {
        id: draftId,
        group_id: groupId,
        created_by_user_id: actor,
        team_a_user_ids: [actor],
        team_b_user_ids: [],
        expires_at: "2099-01-01T00:00:00.000Z",
        submitted_match_id: null,
        updated_at: "2026-08-19T12:00:00.000Z",
      },
      activeMemberIds: [actor],
      deletedDraftId: null,
    });
    supabaseMocks.createSupabaseServiceClient.mockReturnValue(service);

    const result = await actions.syncActiveMatchDraft({
      draftId,
      groupId,
      format: "singles",
      teamAUserIds: [],
      teamBUserIds: [],
      games: [{ teamAScore: null, teamBScore: null, winnerTeam: "A" }],
    });

    expect(result).toEqual({
      ok: false,
      message: "This active match changed before it could be deleted.",
    });
  });

  test("preserves the selected winner in an active draft", async () => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const opponent = "77777777-7777-4777-8777-777777777777";
    const groupId = "66666666-6666-4666-8666-666666666666";
    const { service, update } = draftService({
      draft: {
        id: "33333333-3333-4333-8333-333333333333",
        group_id: groupId,
        created_by_user_id: actor,
        team_a_user_ids: [actor],
        team_b_user_ids: [opponent],
        expires_at: "2099-01-01T00:00:00.000Z",
        submitted_match_id: null,
      },
      activeMemberIds: [actor, opponent],
    });
    supabaseMocks.createSupabaseServiceClient.mockReturnValue(service);

    await actions.saveActiveMatchDraft({
      draftId: "33333333-3333-4333-8333-333333333333",
      groupId,
      format: "singles",
      teamAUserIds: [actor],
      teamBUserIds: [opponent],
      games: [{ teamAScore: 21, teamBScore: 19, winnerTeam: "B" }],
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      games: [{ teamAScore: 21, teamBScore: 19, winnerTeam: "B" }],
    }));
  });

  test("rejects a stale save after submission without deleting the submitted draft", async () => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const creator = "22222222-2222-4222-8222-222222222222";
    const opponent = "77777777-7777-4777-8777-777777777777";
    const groupId = "66666666-6666-4666-8666-666666666666";
    const { service, update, deleteDraft } = draftService({
      draft: {
        id: "33333333-3333-4333-8333-333333333333",
        group_id: groupId,
        created_by_user_id: creator,
        team_a_user_ids: [actor],
        team_b_user_ids: [opponent],
        expires_at: "2099-01-01T00:00:00.000Z",
        submitted_match_id: "88888888-8888-4888-8888-888888888888",
      },
      activeMemberIds: [actor, creator, opponent],
    });
    supabaseMocks.createSupabaseServiceClient.mockReturnValue(service);

    const result = await actions.saveActiveMatchDraft({
      draftId: "33333333-3333-4333-8333-333333333333",
      groupId,
      format: "singles",
      teamAUserIds: [actor],
      teamBUserIds: [opponent],
      games: [{ teamAScore: 21, teamBScore: 19, winnerTeam: "A" }],
    });

    expect(result).toEqual({ ok: false, message: "This active match was already submitted." });
    expect(update).not.toHaveBeenCalled();
    expect(deleteDraft).not.toHaveBeenCalled();
  });

  test("only deletes an expired draft if it is still unsubmitted and has the observed expiry", async () => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const opponent = "77777777-7777-4777-8777-777777777777";
    const groupId = "66666666-6666-4666-8666-666666666666";
    const expiresAt = "2000-01-01T00:00:00.000Z";
    const { service, deleteDraft, draftEq, draftIs } = draftService({
      draft: {
        id: "33333333-3333-4333-8333-333333333333",
        group_id: groupId,
        created_by_user_id: actor,
        team_a_user_ids: [actor],
        team_b_user_ids: [opponent],
        expires_at: expiresAt,
        submitted_match_id: null,
      },
      activeMemberIds: [actor, opponent],
    });
    supabaseMocks.createSupabaseServiceClient.mockReturnValue(service);

    const result = await actions.saveActiveMatchDraft({
      draftId: "33333333-3333-4333-8333-333333333333",
      groupId,
      format: "singles",
      teamAUserIds: [actor],
      teamBUserIds: [opponent],
      games: [{ teamAScore: 21, teamBScore: 19, winnerTeam: "A" }],
    });

    expect(result).toEqual({ ok: false, message: "This active match expired. Start a new match." });
    expect(deleteDraft).toHaveBeenCalledOnce();
    expect(draftEq).toHaveBeenCalledWith("expires_at", expiresAt);
    expect(draftIs).toHaveBeenCalledWith("submitted_match_id", null);
  });

  test("rejects an active group member who is not the creator or a stored participant", async () => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const creator = "22222222-2222-4222-8222-222222222222";
    const teamAPlayer = "77777777-7777-4777-8777-777777777777";
    const teamBPlayer = "88888888-8888-4888-8888-888888888888";
    const groupId = "66666666-6666-4666-8666-666666666666";
    const { service, update } = draftService({
      draft: {
        id: "33333333-3333-4333-8333-333333333333",
        group_id: groupId,
        created_by_user_id: creator,
        team_a_user_ids: [teamAPlayer],
        team_b_user_ids: [teamBPlayer],
        expires_at: "2099-01-01T00:00:00.000Z",
        submitted_match_id: null,
      },
      activeMemberIds: [actor, creator, teamAPlayer, teamBPlayer],
    });
    supabaseMocks.createSupabaseServiceClient.mockReturnValue(service);

    const result = await actions.saveActiveMatchDraft({
      draftId: "33333333-3333-4333-8333-333333333333",
      groupId,
      format: "singles",
      teamAUserIds: [teamAPlayer],
      teamBUserIds: [teamBPlayer],
      games: [{ teamAScore: 21, teamBScore: 19, winnerTeam: "A" }],
    });

    expect(result).toEqual({
      ok: false,
      message: "Only the match creator or a participant can edit this active match.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  test("rejects an update when the actor loses stored-draft authorization before the write", async () => {
    const actor = "11111111-1111-4111-8111-111111111111";
    const creator = "22222222-2222-4222-8222-222222222222";
    const opponent = "77777777-7777-4777-8777-777777777777";
    const groupId = "66666666-6666-4666-8666-666666666666";
    const { service } = draftService({
      draft: {
        id: "33333333-3333-4333-8333-333333333333",
        group_id: groupId,
        created_by_user_id: creator,
        team_a_user_ids: [actor],
        team_b_user_ids: [opponent],
        expires_at: "2099-01-01T00:00:00.000Z",
        submitted_match_id: null,
      },
      activeMemberIds: [actor, creator, opponent],
      updatedDraftId: null,
    });
    supabaseMocks.createSupabaseServiceClient.mockReturnValue(service);

    const result = await actions.saveActiveMatchDraft({
      draftId: "33333333-3333-4333-8333-333333333333",
      groupId,
      format: "singles",
      teamAUserIds: [actor],
      teamBUserIds: [opponent],
      games: [{ teamAScore: 21, teamBScore: 19, winnerTeam: "A" }],
    });

    expect(result).toEqual({
      ok: false,
      message: "This active match is unavailable or you no longer have access.",
    });
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
      games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
    });

    expect(result).toEqual({ ok: false, message: "This active match belongs to another group." });
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  test("forwards the selected winner with a revised game", async () => {
    await actions.reviseMatch({
      commandId: "88888888-8888-4888-8888-888888888888",
      groupId: "66666666-6666-4666-8666-666666666666",
      matchId: "22222222-2222-4222-8222-222222222222",
      expectedRevisionId: "33333333-3333-4333-8333-333333333333",
      format: "singles",
      teamAUserIds: ["11111111-1111-4111-8111-111111111111"],
      teamBUserIds: ["77777777-7777-4777-8777-777777777777"],
      games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "B" }],
    });

    expect(supabaseMocks.rpc).toHaveBeenCalledWith("command_revise_match", expect.objectContaining({
      p_games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "B" }],
    }));
    expect(nextCacheMocks.revalidatePath).not.toHaveBeenCalledWith(
      "/groups/66666666-6666-4666-8666-666666666666/matches/22222222-2222-4222-8222-222222222222/revise",
    );
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith(
      "/groups/66666666-6666-4666-8666-666666666666/members",
    );
    expect(nextCacheMocks.revalidatePath).toHaveBeenCalledWith(
      "/groups/66666666-6666-4666-8666-666666666666/rankings",
    );
  });

  test("atomically corrects a match without free-text metadata", async () => {
    const result = await actions.correctMatch({
      commandId: "88888888-8888-4888-8888-888888888888",
      groupId: "66666666-6666-4666-8666-666666666666",
      matchId: "22222222-2222-4222-8222-222222222222",
      expectedRevisionId: "33333333-3333-4333-8333-333333333333",
      format: "singles",
      teamAUserIds: ["11111111-1111-4111-8111-111111111111"],
      teamBUserIds: ["77777777-7777-4777-8777-777777777777"],
      games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "B" }],
    });

    expect(result.ok).toBe(true);
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("command_dispute_and_revise_match", {
      p_command_id: "88888888-8888-4888-8888-888888888888",
      p_match_id: "22222222-2222-4222-8222-222222222222",
      p_expected_revision_id: "33333333-3333-4333-8333-333333333333",
      p_format: "singles",
      p_team_a: ["11111111-1111-4111-8111-111111111111"],
      p_team_b: ["77777777-7777-4777-8777-777777777777"],
      p_games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "B" }],
    });
  });

  test("returns deadline-specific guidance when the correction window expired", async () => {
    supabaseMocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "MREXP", message: "Match correction window has expired" },
    });

    const result = await actions.correctMatch({
      commandId: "88888888-8888-4888-8888-888888888888",
      groupId: "66666666-6666-4666-8666-666666666666",
      matchId: "22222222-2222-4222-8222-222222222222",
      expectedRevisionId: "33333333-3333-4333-8333-333333333333",
      format: "singles",
      teamAUserIds: ["11111111-1111-4111-8111-111111111111"],
      teamBUserIds: ["77777777-7777-4777-8777-777777777777"],
      games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
    });

    expect(result).toMatchObject({
      ok: false,
      message: "The 30-day correction window has expired.",
    });
  });

  test.each([
    ["submission", () => actions.submitMatch({
      commandId: "55555555-5555-4555-8555-555555555555",
      groupId: "66666666-6666-4666-8666-666666666666",
      format: "singles",
      teamAUserIds: ["11111111-1111-4111-8111-111111111111"],
      teamBUserIds: ["77777777-7777-4777-8777-777777777777"],
      games: [{ teamAScore: 21, teamBScore: 18 }],
    } as Parameters<typeof actions.submitMatch>[0])],
    ["revision", () => actions.reviseMatch({
      commandId: "88888888-8888-4888-8888-888888888888",
      groupId: "66666666-6666-4666-8666-666666666666",
      matchId: "22222222-2222-4222-8222-222222222222",
      expectedRevisionId: "33333333-3333-4333-8333-333333333333",
      format: "singles",
      teamAUserIds: ["11111111-1111-4111-8111-111111111111"],
      teamBUserIds: ["77777777-7777-4777-8777-777777777777"],
      games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "C" }],
    } as unknown as Parameters<typeof actions.reviseMatch>[0])],
    ["correction", () => actions.correctMatch({
      commandId: "88888888-8888-4888-8888-888888888888",
      groupId: "66666666-6666-4666-8666-666666666666",
      matchId: "22222222-2222-4222-8222-222222222222",
      expectedRevisionId: "33333333-3333-4333-8333-333333333333",
      format: "singles",
      teamAUserIds: ["11111111-1111-4111-8111-111111111111"],
      teamBUserIds: ["77777777-7777-4777-8777-777777777777"],
      games: [{ teamAScore: 21, teamBScore: 18 }],
    } as Parameters<typeof actions.correctMatch>[0])],
  ])("rejects malformed winners before invoking the %s command", async (_command, run) => {
    await expect(run()).resolves.toMatchObject({ ok: false });
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
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
