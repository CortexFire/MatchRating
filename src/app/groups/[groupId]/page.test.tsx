import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import GroupPage from "./page";

vi.mock("@/lib/app-data", () => ({
  getGroup: vi.fn(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Wednesday Club Ladder",
    description: "Friendly competitive badminton ladder for weekly club nights.",
    memberCount: 8,
  })),
  listGroupActiveMatchDrafts: vi.fn(async () => [
    {
      id: "22222222-2222-4222-8222-222222222222",
      groupId: "11111111-1111-4111-8111-111111111111",
      groupName: "Wednesday Club Ladder",
      format: "singles",
      teamA: ["Alice Tan"],
      teamB: ["Bea Chen"],
      scores: ["12-12"],
      role: "Viewer",
    },
  ]),
}));

describe("GroupPage", () => {
  test("renders active match drafts for visible players", async () => {
    const html = renderToStaticMarkup(
      await GroupPage({
        params: Promise.resolve({ groupId: "11111111-1111-4111-8111-111111111111" }),
      }),
    );

    expect(html).toContain("Active matches");
    expect(html).toContain("Alice Tan vs Bea Chen");
    expect(html).toContain('href="/groups/11111111-1111-4111-8111-111111111111/matches/new?draftId=22222222-2222-4222-8222-222222222222"');
  });
});