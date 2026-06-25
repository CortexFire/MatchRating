import { beforeEach, describe, expect, test, vi } from "vitest";
import * as actions from "@/app/actions";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => {
  const auth = { getClaims: vi.fn() };
  const profileUpsert = { select: vi.fn(() => profileUpsert), single: vi.fn() };
  const activeMembership = {
    select: vi.fn(() => activeMembership),
    eq: vi.fn(() => activeMembership),
    is: vi.fn(() => activeMembership),
    maybeSingle: vi.fn(),
  };
  const guestMemberships = {
    select: vi.fn(() => guestMemberships),
    eq: vi.fn(() => guestMemberships),
    is: vi.fn(() => guestMemberships),
    in: vi.fn(() => guestMemberships),
    then: vi.fn(),
  };
  const guestProfiles = {
    select: vi.fn(() => guestProfiles),
    eq: vi.fn(() => guestProfiles),
    in: vi.fn(() => guestProfiles),
    then: vi.fn(),
  };
  const profilesTable = { upsert: vi.fn(() => profileUpsert), select: vi.fn(() => guestProfiles) };
  const participants = {
    select: vi.fn(() => participants),
    in: vi.fn(() => participants),
    then: vi.fn(),
  };
  const ratings = {
    select: vi.fn(() => ratings),
    eq: vi.fn(() => ratings),
    in: vi.fn(() => ratings),
    then: vi.fn(),
  };
  const untouchedUpdate = {
    update: vi.fn(() => untouchedUpdate),
    eq: vi.fn(() => untouchedUpdate),
    in: vi.fn(() => untouchedUpdate),
    then: vi.fn(),
  };
  let membershipCall = 0;

  return {
    auth,
    profileUpsert,
    profilesTable,
    activeMembership,
    guestMemberships,
    guestProfiles,
    participants,
    ratings,
    untouchedUpdate,
    requireUserId: vi.fn(),
    createSupabaseServerClient: vi.fn(async () => ({ auth })),
    createSupabaseServiceClient: vi.fn(() => ({
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return profilesTable;
        }
        if (table === "group_memberships") {
          membershipCall += 1;
          return membershipCall === 1 ? activeMembership : guestMemberships;
        }
        if (table === "match_participants") {
          return participants;
        }
        if (table === "group_rating_states") {
          return ratings;
        }
        return untouchedUpdate;
      }),
    })),
    resetMembershipCalls: () => {
      membershipCall = 0;
    },
  };
});

vi.mock("@/lib/supabase/server", () => supabaseMocks);

describe("onboarding actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.resetMembershipCalls();
    supabaseMocks.requireUserId.mockResolvedValue("user-1");
    supabaseMocks.profileUpsert.single.mockResolvedValue({ data: { id: "user-1" }, error: null });
    supabaseMocks.activeMembership.maybeSingle.mockResolvedValue({ data: { id: "member-1", role: "member" }, error: null });
    supabaseMocks.guestMemberships.then.mockImplementation((resolve) =>
      resolve({ data: [{ user_id: "guest-a" }, { user_id: "guest-b" }], error: null }),
    );
    supabaseMocks.guestProfiles.then.mockImplementation((resolve) =>
      resolve({ data: [{ id: "guest-a", display_name: "Jordan Lee" }, { id: "guest-b", display_name: "Amanda Xu" }], error: null }),
    );
    supabaseMocks.ratings.then.mockImplementation((resolve) => resolve({ data: [], error: null }));
    supabaseMocks.participants.then.mockImplementation((resolve) =>
      resolve({ data: [{ revision_id: "revision-1", user_id: "guest-a" }, { revision_id: "revision-1", user_id: "guest-b" }], error: null }),
    );
  });

  test("completeOnboardingProfile upserts the signed-in user's non-guest profile", async () => {
    const result = await actions.completeOnboardingProfile({ firstName: " Maya ", lastName: " Chen " });

    expect(result).toEqual({ ok: true, data: { profileId: "user-1" } });
    expect(supabaseMocks.profilesTable.upsert).toHaveBeenCalledWith({
      id: "user-1",
      first_name: "Maya",
      last_name: "Chen",
      display_name: "Maya Chen",
      is_guest: false,
    });
  });

  test("claimGuestProfiles rejects guest merges that duplicate a match participant", async () => {
    const result = await actions.claimGuestProfiles({ groupId: "group-1", guestProfileIds: ["guest-a", "guest-b"] });

    expect(result).toEqual({
      ok: false,
      message: "Those guest profiles cannot be merged because they appear together in a match.",
    });
    expect(supabaseMocks.untouchedUpdate.update).not.toHaveBeenCalled();
  });
});