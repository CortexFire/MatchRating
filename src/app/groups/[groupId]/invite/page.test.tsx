import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import GroupInvitePage from "./page";

const mocks = vi.hoisted(() => ({
  getGroup: vi.fn(async () => ({ id: "group-1", name: "Wednesday Club", description: "", memberCount: 2 })),
  getOrCreateInvite: vi.fn(async () => ({ ok: false, message: "Invite unavailable." })),
}));

vi.mock("@/lib/app-data", () => ({ getGroup: mocks.getGroup }));
vi.mock("@/app/actions", () => ({ getOrCreateInvite: mocks.getOrCreateInvite }));

describe("GroupInvitePage", () => {
  test("returns directly to the group landing page", async () => {
    const html = renderToStaticMarkup(
      await GroupInvitePage({ params: Promise.resolve({ groupId: "group-1" }) }),
    );

    expect(html).toContain('href="/groups/group-1"');
    expect(html).not.toContain('href="/groups/group-1/members"');
  });
});
