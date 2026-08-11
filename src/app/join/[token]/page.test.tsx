/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import JoinPage from "./page";

const mocks = vi.hoisted(() => {
  const profiles = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  const memberships = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(),
  };

  return {
    getInviteSummary: vi.fn(),
    joinGroupByInvite: vi.fn(),
    getClaims: vi.fn(),
    createSupabaseServerClient: vi.fn(),
    createSupabaseServiceClient: vi.fn(),
    redirect: vi.fn(() => {
      throw new Error("NEXT_REDIRECT");
    }),
    profiles,
    memberships,
  };
});

vi.mock("@/app/actions", () => ({
  getInviteSummary: mocks.getInviteSummary,
  joinGroupByInvite: mocks.joinGroupByInvite,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  createSupabaseServiceClient: mocks.createSupabaseServiceClient,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

describe("JoinPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInviteSummary.mockResolvedValue({
      ok: true,
      data: {
        groupId: "group-1",
        groupName: "Downtown Rec Club",
        memberCount: 12,
        lastActiveText: "Last active 3 days ago",
      },
    });
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { getClaims: mocks.getClaims } });

    mocks.profiles.select.mockReturnValue(mocks.profiles);
    mocks.profiles.eq.mockReturnValue(mocks.profiles);
    mocks.profiles.maybeSingle.mockResolvedValue({ data: { id: "user-1" }, error: null });
    mocks.memberships.select.mockReturnValue(mocks.memberships);
    mocks.memberships.eq.mockReturnValue(mocks.memberships);
    mocks.memberships.is.mockReturnValue(mocks.memberships);
    mocks.memberships.maybeSingle.mockResolvedValue({ data: { id: "membership-1" }, error: null });
    mocks.createSupabaseServiceClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "profiles") return mocks.profiles;
        if (table === "group_memberships") return mocks.memberships;
        throw new Error(`Unexpected table: ${table}`);
      }),
    });
  });

  test("shows active members an already-joined state linked to the group", async () => {
    render(await JoinPage({ params: Promise.resolve({ token: "invite-token" }) }));

    expect(screen.getByRole("heading", { name: "You're already in" })).toBeTruthy();
    expect(screen.getByText("Downtown Rec Club")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ok" }).getAttribute("href")).toBe("/groups/group-1");
    expect(screen.queryByText("Confirm Join")).toBeNull();
    expect(screen.queryByRole("heading", { name: "You've been invited to join" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "No thanks" })).toBeNull();

    expect(mocks.memberships.eq).toHaveBeenCalledWith("group_id", "group-1");
    expect(mocks.memberships.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mocks.memberships.eq).toHaveBeenCalledWith("status", "active");
    expect(mocks.memberships.is).toHaveBeenCalledWith("left_at", null);
  });

  test("keeps the invite decision state for users without an active membership", async () => {
    mocks.memberships.maybeSingle.mockResolvedValue({ data: null, error: null });

    render(await JoinPage({ params: Promise.resolve({ token: "invite-token" }) }));

    expect(screen.getByRole("heading", { name: "You've been invited to join" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No thanks" })).toBeTruthy();
    expect(screen.queryByText("Confirm Join")).toBeNull();
    expect(screen.queryByRole("heading", { name: "You're already in" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Ok" })).toBeNull();
  });

  test("surfaces membership lookup errors instead of choosing an invite state", async () => {
    mocks.memberships.maybeSingle.mockResolvedValue({
      data: null,
      error: new Error("membership lookup failed"),
    });

    await expect(JoinPage({ params: Promise.resolve({ token: "invite-token" }) })).rejects.toThrow(
      "membership lookup failed",
    );
  });
});
