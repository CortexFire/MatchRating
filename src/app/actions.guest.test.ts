import { beforeEach, describe, expect, test, vi } from "vitest";
import * as actions from "@/app/actions";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => {
  const membershipSelect = {
    eq: vi.fn(() => membershipSelect),
    is: vi.fn(() => membershipSelect),
    maybeSingle: vi.fn(),
  };
  const profileInsertResult = {
    select: vi.fn(),
  };
  const tables = {
    group_memberships: {
      select: vi.fn(() => membershipSelect),
      insert: vi.fn(),
    },
    profiles: {
      insert: vi.fn(() => profileInsertResult),
    },
    group_rating_states: {
      insert: vi.fn(),
    },
  };
  const service = {
    from: vi.fn((table: keyof typeof tables) => tables[table]),
  };
  const rpc = vi.fn();

  return {
    createSupabaseServerClient: vi.fn(async () => ({ rpc })),
    createSupabaseServiceClient: vi.fn(() => service),
    requireUserId: vi.fn(),
    membershipSelect,
    profileInsertResult,
    service,
    rpc,
    tables,
  };
});

vi.mock("@/lib/supabase/server", () => supabaseMocks);

describe("guest player actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.requireUserId.mockResolvedValue("owner-user");
    supabaseMocks.membershipSelect.maybeSingle.mockResolvedValue({
      data: { id: "membership-1", role: "owner" },
      error: null,
    });
    supabaseMocks.rpc.mockResolvedValue({
      data: { players: [{ id: "guest-1", name: "Mary Jane Watson" }, { id: "guest-2", name: "Prince" }] },
      error: null,
    });
  });

  test("creates guest profiles, memberships, and rating states", async () => {
    const result = await actions.createGuestPlayers({
      groupId: "group-1",
      names: [" Mary   Jane Watson ", "Prince"],
    });

    expect(result).toEqual({
      ok: true,
      data: {
        players: [
          {
            id: "guest-1",
            name: "Mary Jane Watson",
            initials: "MJ",
            role: "Member",
            rating: 1500,
            rd: 350,
            rank: 0,
            gamesPlayed: 0,
            status: "Inactive",
            isGuest: true,
          },
          {
            id: "guest-2",
            name: "Prince",
            initials: "P",
            role: "Member",
            rating: 1500,
            rd: 350,
            rank: 0,
            gamesPlayed: 0,
            status: "Inactive",
            isGuest: true,
          },
        ],
      },
    });
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("command_create_guest_players", expect.objectContaining({
      p_group_id: "group-1", p_names: ["Mary Jane Watson", "Prince"], p_command_id: expect.any(String),
    }));
  });

  test("rejects unauthenticated callers before inserting guests", async () => {
    supabaseMocks.requireUserId.mockRejectedValue(new Error("Unauthorized"));

    const result = await actions.createGuestPlayers({ groupId: "group-1", names: ["Noah Kim"] });

    expect(result).toEqual({ ok: false, code: "UNKNOWN", message: "Could not create guest players." });
    expect(supabaseMocks.tables.profiles.insert).not.toHaveBeenCalled();
  });

  test("rejects callers who are not active group members", async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: { code: "MR403", message: "Not an active group member" } });

    const result = await actions.createGuestPlayers({ groupId: "group-1", names: ["Noah Kim"] });

    expect(result).toEqual({ ok: false, code: "NOT_GROUP_MEMBER", message: "You are not an active member of this group." });
    expect(supabaseMocks.tables.profiles.insert).not.toHaveBeenCalled();
  });
});
