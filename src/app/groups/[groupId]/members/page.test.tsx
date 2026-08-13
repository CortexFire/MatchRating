import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import MembersPage, { MembersContent } from "./page";

const mocks = vi.hoisted(() => ({
  getGroup: vi.fn(),
  getGroupRatingRebuildStatus: vi.fn(),
  listGroupPlayers: vi.fn(),
}));

vi.mock("@/lib/app-data", () => ({
  getGroup: mocks.getGroup,
  getGroupRatingRebuildStatus: mocks.getGroupRatingRebuildStatus,
  listGroupPlayers: mocks.listGroupPlayers,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const groupId = "11111111-1111-4111-8111-111111111111";
const players = [
  { id: "alice", name: "Alice Tan", initials: "AT", role: "Owner" as const, rating: 1640, rd: 72, rank: 1, gamesPlayed: 18, status: "Active" as const },
  { id: "bea", name: "Bea Rivera", initials: "BR", role: "Member" as const, rating: 1580, rd: 81, rank: 2, gamesPlayed: 14, status: "Inactive" as const },
  { id: "cory", name: "Cory Shah", initials: "CS", role: "Member" as const, rating: 1510, rd: 90, rank: 3, gamesPlayed: 10, status: "Inactive" as const },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getGroup.mockResolvedValue({ id: groupId, name: "Wednesday Club", description: "", memberCount: 3 });
  mocks.getGroupRatingRebuildStatus.mockResolvedValue({ id: null, status: null, canRetry: false });
  mocks.listGroupPlayers.mockResolvedValue(players);
});

test("shows when member ratings are still rebuilding", async () => {
  mocks.getGroupRatingRebuildStatus.mockResolvedValue({ id: "job-1", status: "running", canRetry: false });

  const html = renderToStaticMarkup(await MembersContent({ params: Promise.resolve({ groupId }) }));

  expect(html).toContain("Match saved. Ratings updating");
});

test("reports recency-active players separately from the full membership count", async () => {
  const html = renderToStaticMarkup(await MembersContent({ params: Promise.resolve({ groupId }) }));

  expect(html).toContain("1 active of 3 members");
  expect(html).not.toContain("3 active players in this group");
});

test("uses membership language when the roster is empty", async () => {
  mocks.getGroup.mockResolvedValue({ id: groupId, name: "Wednesday Club", description: "", memberCount: 0 });
  mocks.listGroupPlayers.mockResolvedValue([]);

  const html = renderToStaticMarkup(await MembersContent({ params: Promise.resolve({ groupId }) }));

  expect(html).toContain("No members yet");
  expect(html).not.toContain("No active members yet");
});

test("renders an immediate group shell before route parameters resolve", () => {
  const html = renderToStaticMarkup(
    <MembersPage params={new Promise<never>(() => undefined)} />,
  );

  expect(html).toContain("Loading group");
  expect(html).toContain('aria-busy="true"');
});
