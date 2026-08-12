import { beforeEach, describe, expect, test, vi } from "vitest";
import * as actions from "@/app/actions";

const visibilityMocks = vi.hoisted(() => ({
  listVisibleGroupMemberships: vi.fn(),
}));

vi.mock("@/lib/group-membership-visibility", () => visibilityMocks);

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => {
  const activeMembership = {
    select: vi.fn(() => activeMembership),
    eq: vi.fn(() => activeMembership),
    is: vi.fn(() => activeMembership),
    maybeSingle: vi.fn(),
  };
  const inviteLookup = {
    select: vi.fn(() => inviteLookup),
    eq: vi.fn(() => inviteLookup),
    is: vi.fn(() => inviteLookup),
    maybeSingle: vi.fn(),
  };
  const inviteInsertResult = {
    select: vi.fn(() => inviteInsertResult),
    single: vi.fn(),
  };
  const invitesTable = {
    select: vi.fn(() => inviteLookup),
    insert: vi.fn(() => inviteInsertResult),
    update: vi.fn(() => inviteLookup),
  };
  const groupsTable = {
    select: vi.fn(() => groupsTable),
    eq: vi.fn(() => groupsTable),
    maybeSingle: vi.fn(),
  };
  const membersTable = {
    select: vi.fn(() => membersTable),
    eq: vi.fn(() => membersTable),
    is: vi.fn(() => membersTable),
    maybeSingle: activeMembership.maybeSingle,
  };
  const matchesTable = {
    select: vi.fn(() => matchesTable),
    eq: vi.fn(() => matchesTable),
    order: vi.fn(() => matchesTable),
    limit: vi.fn(() => matchesTable),
    maybeSingle: vi.fn(),
  };
  const ignoredTable = {
    select: vi.fn(() => ignoredTable),
    eq: vi.fn(() => ignoredTable),
    is: vi.fn(() => ignoredTable),
    maybeSingle: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn(),
  };
  const service = {
    from: vi.fn((table: string) => {
      if (table === "group_memberships") {
        return membersTable;
      }
      if (table === "group_invites") {
        return invitesTable;
      }
      if (table === "groups") {
        return groupsTable;
      }
      if (table === "matches") {
        return matchesTable;
      }
      return ignoredTable;
    }),
  };

  return {
    requireUserId: vi.fn(),
    createSupabaseServerClient: vi.fn(),
    createSupabaseServiceClient: vi.fn(() => service),
    activeMembership,
    inviteLookup,
    inviteInsertResult,
    invitesTable,
    groupsTable,
    membersTable,
    matchesTable,
    ignoredTable,
    service,
  };
});

vi.mock("@/lib/supabase/server", () => supabaseMocks);

describe("invite actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://matches.example.com/";
    supabaseMocks.requireUserId.mockResolvedValue("user-1");
    supabaseMocks.activeMembership.maybeSingle.mockResolvedValue({
      data: { id: "membership-1", role: "member" },
      error: null,
    });
    supabaseMocks.inviteLookup.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    supabaseMocks.inviteInsertResult.single.mockResolvedValue({
      data: { id: "33333333-3333-4333-8333-333333333333" },
      error: null,
    });
    supabaseMocks.groupsTable.maybeSingle.mockResolvedValue({
      data: { id: "group-1", name: "Downtown Rec Club" },
      error: null,
    });
    supabaseMocks.membersTable.select.mockReturnValue(supabaseMocks.membersTable);
    supabaseMocks.membersTable.eq.mockReturnValue(supabaseMocks.membersTable);
    supabaseMocks.membersTable.is.mockReturnValue(supabaseMocks.membersTable);
    supabaseMocks.matchesTable.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    visibilityMocks.listVisibleGroupMemberships.mockResolvedValue([
      { groupId: "group-1", userId: "user-1", role: "member", profile: null },
    ]);
  });

  test("returns the existing permanent invite without inserting another", async () => {
    supabaseMocks.inviteLookup.maybeSingle.mockResolvedValue({
      data: { id: "22222222-2222-4222-8222-222222222222" },
      error: null,
    });

    const result = await (actions as typeof actions & {
      getOrCreateInvite: (groupId: string) => Promise<actions.ActionResult<{ token: string; url: string }>>;
    }).getOrCreateInvite("group-1");

    expect(result).toEqual({
      ok: true,
      data: {
        token: "22222222-2222-4222-8222-222222222222",
        url: "https://matches.example.com/join/22222222-2222-4222-8222-222222222222",
      },
    });
    expect(supabaseMocks.invitesTable.insert).not.toHaveBeenCalled();
  });

  test("creates one permanent invite when the group has none", async () => {
    const result = await (actions as typeof actions & {
      getOrCreateInvite: (groupId: string) => Promise<actions.ActionResult<{ token: string; url: string }>>;
    }).getOrCreateInvite("group-1");

    expect(result).toEqual({
      ok: true,
      data: {
        token: "33333333-3333-4333-8333-333333333333",
        url: "https://matches.example.com/join/33333333-3333-4333-8333-333333333333",
      },
    });
    expect(supabaseMocks.invitesTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        group_id: "group-1",
        created_by_user_id: "user-1",
      }),
    );
    expect(supabaseMocks.invitesTable.insert).toHaveBeenCalledWith(
      expect.not.objectContaining({
        expires_at: expect.anything(),
        max_uses: expect.anything(),
      }),
    );
  });

  test("rejects non-members before creating invites", async () => {
    supabaseMocks.activeMembership.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await (actions as typeof actions & {
      getOrCreateInvite: (groupId: string) => Promise<actions.ActionResult<{ token: string; url: string }>>;
    }).getOrCreateInvite("group-1");

    expect(result).toEqual({
      ok: false,
      message: "You are not an active member of this group.",
    });
    expect(supabaseMocks.invitesTable.insert).not.toHaveBeenCalled();
  });

  test("returns Supabase invite insert errors", async () => {
    supabaseMocks.inviteInsertResult.single.mockResolvedValue({
      data: null,
      error: new Error("duplicate active invite"),
    });

    const result = await (actions as typeof actions & {
      getOrCreateInvite: (groupId: string) => Promise<actions.ActionResult<{ token: string; url: string }>>;
    }).getOrCreateInvite("group-1");

    expect(result).toEqual({ ok: false, message: "duplicate active invite" });
  });

  test("loads invite summaries by invite id", async () => {
    supabaseMocks.inviteLookup.maybeSingle.mockResolvedValue({
      data: {
        id: "22222222-2222-4222-8222-222222222222",
        group_id: "group-1",
        revoked_at: null,
      },
      error: null,
    });
    supabaseMocks.membersTable.is.mockImplementation(() =>
      Promise.resolve({
        data: [{ user_id: "user-1" }, { user_id: "user-2" }],
        error: null,
      }) as never,
    );

    const result = await actions.getInviteSummary("22222222-2222-4222-8222-222222222222");

    expect(result).toEqual({
      ok: true,
      data: {
        groupId: "group-1",
        groupName: "Downtown Rec Club",
        memberCount: 1,
        lastActiveText: "No matches yet",
      },
    });
    expect(supabaseMocks.inviteLookup.eq).toHaveBeenCalledWith("id", "22222222-2222-4222-8222-222222222222");
  });

  test("rejects revoked invite ids", async () => {
    supabaseMocks.inviteLookup.maybeSingle.mockResolvedValue({
      data: {
        id: "22222222-2222-4222-8222-222222222222",
        group_id: "group-1",
        revoked_at: "2026-01-01T00:00:00.000Z",
      },
      error: null,
    });

    const result = await actions.getInviteSummary("22222222-2222-4222-8222-222222222222");

    expect(result).toEqual({
      ok: false,
      message: "This invite link is no longer valid.",
    });
  });
});
