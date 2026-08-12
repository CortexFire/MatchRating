import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import GroupPage from "./page";

const mocks = vi.hoisted(() => ({
  canCurrentUserReadGroup: vi.fn(),
  getGroup: vi.fn(),
  listGroupActiveMatchDrafts: vi.fn(),
  getGroupRatingRebuildStatus: vi.fn(),
  listGroupMatches: vi.fn(),
  listGroupPlayers: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/app-data", () => ({
  canCurrentUserReadGroup: mocks.canCurrentUserReadGroup,
  getGroup: mocks.getGroup,
  listGroupActiveMatchDrafts: mocks.listGroupActiveMatchDrafts,
  getGroupRatingRebuildStatus: mocks.getGroupRatingRebuildStatus,
  listGroupMatches: mocks.listGroupMatches,
  listGroupPlayers: mocks.listGroupPlayers,
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ refresh: vi.fn() }),
}));

const groupId = "11111111-1111-4111-8111-111111111111";
const group = {
  id: groupId,
  name: "Wednesday Club Ladder",
  description: "Friendly competitive badminton ladder for weekly club nights.",
  memberCount: 2,
};
const draft = {
  id: "22222222-2222-4222-8222-222222222222",
  groupId,
  groupName: group.name,
  format: "singles" as const,
  teamA: ["Alice Tan"],
  teamB: ["Bea Chen"],
  scores: ["12-12"],
  role: "Participant" as const,
};
const players = [
  { id: "alice", name: "Alice Tan", initials: "AT", role: "Owner" as const, rating: 1640, rd: 72, rank: 1, gamesPlayed: 18, status: "Active" as const },
];
const recentMatches = ["pending_confirmation", "confirmed", "disputed"].map((status, index) => ({
  id: `match-${index + 1}`, groupId, groupName: group.name, revisionId: `revision-${index + 1}`, submittedByUserId: "alice",
  status: status as "pending_confirmation" | "confirmed" | "disputed", submittedAt: `2026-08-0${7 - index}T20:00:00.000Z`, reviewStartedAt: `2026-08-0${7 - index}T20:00:00.000Z`, disputeUntil: `2026-09-0${6 - index}T20:00:00.000Z`, format: "singles" as const,
  teamA: [{ id: "alice", name: "Alice Tan", initials: "AT" }], teamB: [{ id: "bea", name: "Bea Rivera", initials: "BR" }],
  games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" as const }], winnerTeam: "A" as const,
  ratingSummary: "2 rating changes", canConfirm: false, canDispute: status !== "disputed", canRevise: status === "disputed",
}));

describe("GroupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canCurrentUserReadGroup.mockResolvedValue(true);
    mocks.getGroup.mockResolvedValue(group);
    mocks.listGroupActiveMatchDrafts.mockResolvedValue([draft]);
    mocks.getGroupRatingRebuildStatus.mockResolvedValue({ id: "job-1", status: "running", canRetry: false });
    mocks.listGroupMatches.mockResolvedValue(recentMatches);
    mocks.listGroupPlayers.mockResolvedValue(players);
  });

  test("stops with not found before loading private group data when access is denied", async () => {
    mocks.canCurrentUserReadGroup.mockResolvedValue(false);

    await expect(GroupPage({ params: Promise.resolve({ groupId }) })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.getGroup).not.toHaveBeenCalled();
    expect(mocks.listGroupMatches).not.toHaveBeenCalled();
    expect(mocks.listGroupPlayers).not.toHaveBeenCalled();
  });

  test("starts every authorized landing read in parallel", async () => {
    const pending = new Promise<never>(() => {});
    mocks.getGroup.mockReturnValue(pending);
    mocks.listGroupActiveMatchDrafts.mockReturnValue(pending);
    mocks.getGroupRatingRebuildStatus.mockReturnValue(pending);
    mocks.listGroupMatches.mockReturnValue(pending);
    mocks.listGroupPlayers.mockReturnValue(pending);

    void GroupPage({ params: Promise.resolve({ groupId }) });
    await vi.waitFor(() => expect(mocks.canCurrentUserReadGroup).toHaveBeenCalledWith(groupId));
    await vi.waitFor(() => {
      expect(mocks.getGroup).toHaveBeenCalledWith(groupId);
      expect(mocks.listGroupActiveMatchDrafts).toHaveBeenCalledWith(groupId);
      expect(mocks.getGroupRatingRebuildStatus).toHaveBeenCalledWith(groupId);
      expect(mocks.listGroupMatches).toHaveBeenCalledWith(groupId, { limit: 5 });
      expect(mocks.listGroupPlayers).toHaveBeenCalledWith(groupId);
    });
  });

  test("renders preserved status content, all-status recents, and collapsed members", async () => {
    const html = renderToStaticMarkup(await GroupPage({ params: Promise.resolve({ groupId }) }));

    expect(html).toContain("Active matches");
    expect(html).toContain("Alice Tan vs Bea Chen");
    expect(html).toContain("Match saved. Ratings updating");
    expect(html).toContain("Recent Matches");
    expect(html).toContain("Awaiting review");
    expect(html).toContain("Accepted");
    expect(html).toContain("Disputed");
    expect(html).toContain("Members (1)");
    const ratingStatusPosition = html.indexOf("Match saved. Ratings updating");
    const membersPosition = html.indexOf("Members (1)");
    const activeMatchesPosition = html.indexOf("Active matches");
    const recentMatchesPosition = html.indexOf("Recent Matches");

    expect(ratingStatusPosition).toBeLessThan(membersPosition);
    expect(membersPosition).toBeLessThan(activeMatchesPosition);
    expect(activeMatchesPosition).toBeLessThan(recentMatchesPosition);
    expect(html).toContain('href="/groups/11111111-1111-4111-8111-111111111111/invite"');
    expect(html).not.toContain('href="/groups/11111111-1111-4111-8111-111111111111/members"');
    expect(html).not.toContain('href="/groups/11111111-1111-4111-8111-111111111111/rankings"');
  });

  test("treats a missing authorized group as not found", async () => {
    mocks.getGroup.mockResolvedValue(null);

    await expect(GroupPage({ params: Promise.resolve({ groupId }) })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.notFound).toHaveBeenCalledOnce();
  });
});
