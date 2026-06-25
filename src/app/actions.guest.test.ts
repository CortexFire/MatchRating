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

  return {
    createSupabaseServerClient: vi.fn(),
    createSupabaseServiceClient: vi.fn(() => service),
    requireUserId: vi.fn(),
    membershipSelect,
    profileInsertResult,
    service,
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
    supabaseMocks.profileInsertResult.select.mockResolvedValue({
      data: [
        { id: "guest-1", display_name: "Mary Jane Watson" },
        { id: "guest-2", display_name: "Prince" },
      ],
      error: null,
    });
    supabaseMocks.tables.group_memberships.insert.mockResolvedValue({ error: null });
    supabaseMocks.tables.group_rating_states.insert.mockResolvedValue({ error: null });
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
            status: "Active",
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
            status: "Active",
            isGuest: true,
          },
        ],
      },
    });
    expect(supabaseMocks.tables.profiles.insert).toHaveBeenCalledWith([
      {
        display_name: "Mary Jane Watson",
        first_name: "Mary",
        last_name: "Jane Watson",
        is_guest: true,
      },
      {
        display_name: "Prince",
        first_name: "Prince",
        last_name: "",
        is_guest: true,
      },
    ]);
    expect(supabaseMocks.tables.group_memberships.insert).toHaveBeenCalledWith([
      {
        group_id: "group-1",
        user_id: "guest-1",
        role: "member",
        status: "active",
      },
      {
        group_id: "group-1",
        user_id: "guest-2",
        role: "member",
        status: "active",
      },
    ]);
    expect(supabaseMocks.tables.group_rating_states.insert).toHaveBeenCalledWith([
      {
        group_id: "group-1",
        user_id: "guest-1",
        rating: 1500,
        rd: 350,
        volatility: 0.06,
        games_played: 0,
      },
      {
        group_id: "group-1",
        user_id: "guest-2",
        rating: 1500,
        rd: 350,
        volatility: 0.06,
        games_played: 0,
      },
    ]);
  });

  test("rejects unauthenticated callers before inserting guests", async () => {
    supabaseMocks.requireUserId.mockRejectedValue(new Error("Unauthorized"));

    const result = await actions.createGuestPlayers({ groupId: "group-1", names: ["Noah Kim"] });

    expect(result).toEqual({ ok: false, message: "Unauthorized" });
    expect(supabaseMocks.tables.profiles.insert).not.toHaveBeenCalled();
  });

  test("rejects callers who are not active group members", async () => {
    supabaseMocks.membershipSelect.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await actions.createGuestPlayers({ groupId: "group-1", names: ["Noah Kim"] });

    expect(result).toEqual({ ok: false, message: "You are not an active member of this group." });
    expect(supabaseMocks.tables.profiles.insert).not.toHaveBeenCalled();
  });
});