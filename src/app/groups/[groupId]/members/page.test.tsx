import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import MembersPage from "./page";

const mocks = vi.hoisted(() => ({
  getGroup: vi.fn(),
  listGroupPlayers: vi.fn(),
}));

vi.mock("@/lib/app-data", () => ({
  getGroup: mocks.getGroup,
  listGroupPlayers: mocks.listGroupPlayers,
}));

const groupId = "11111111-1111-4111-8111-111111111111";
const players = [
  { id: "alice", name: "Alice Tan", initials: "AT", role: "Owner" as const, rating: 1640, rd: 72, rank: 1, gamesPlayed: 18, status: "Active" as const },
  { id: "bea", name: "Bea Rivera", initials: "BR", role: "Member" as const, rating: 1580, rd: 81, rank: 2, gamesPlayed: 14, status: "Inactive" as const },
  { id: "cory", name: "Cory Shah", initials: "CS", role: "Member" as const, rating: 1510, rd: 90, rank: 3, gamesPlayed: 10, status: "Inactive" as const },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getGroup.mockResolvedValue({ id: groupId, name: "Wednesday Club", description: "", memberCount: 3 });
  mocks.listGroupPlayers.mockResolvedValue(players);
});

test("reports recency-active players separately from the full membership count", async () => {
  const html = renderToStaticMarkup(await MembersPage({ params: Promise.resolve({ groupId }) }));

  expect(html).toContain("1 active of 3 members");
  expect(html).not.toContain("3 active players in this group");
});

test("uses membership language when the roster is empty", async () => {
  mocks.getGroup.mockResolvedValue({ id: groupId, name: "Wednesday Club", description: "", memberCount: 0 });
  mocks.listGroupPlayers.mockResolvedValue([]);

  const html = renderToStaticMarkup(await MembersPage({ params: Promise.resolve({ groupId }) }));

  expect(html).toContain("No members yet");
  expect(html).not.toContain("No active members yet");
});
