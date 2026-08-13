import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { GroupContent } from "./page";

const mocks = vi.hoisted(() => ({
  getGroupPageData: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/navigation-read-models", () => ({ getGroupPageData: mocks.getGroupPageData }));
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
    mocks.getGroupPageData.mockResolvedValue({
      group,
      activeDrafts: [draft],
      ratingStatus: { id: "job-1", status: "running", canRetry: false },
      recentMatches,
      players,
    });
  });

  test("treats an inaccessible group as not found after one consolidated read", async () => {
    mocks.getGroupPageData.mockResolvedValue(null);

    await expect(GroupContent({ params: Promise.resolve({ groupId }) })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.getGroupPageData).toHaveBeenCalledWith(groupId);
  });

  test("loads the authorized group landing model once", async () => {
    await GroupContent({ params: Promise.resolve({ groupId }) });
    expect(mocks.getGroupPageData.mock.calls).toEqual([[groupId]]);
  });

  test("renders pending and disputed recents without confirmed or rating-change labels", async () => {
    const html = renderToStaticMarkup(await GroupContent({ params: Promise.resolve({ groupId }) }));

    expect(html).toContain("Active matches");
    expect(html).toContain("Alice Tan vs Bea Chen");
    expect(html).toContain("Match saved. Ratings updating");
    expect(html).toContain("Recent Matches");
    expect(html).toContain("Awaiting review");
    expect(html).toContain("Disputed");
    expect(html).not.toContain("Accepted");
    expect(html).not.toContain("2 rating changes");
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

});
