import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { GroupInviteContent } from "./page";

const mocks = vi.hoisted(() => ({
  getPrivateGroupMetadata: vi.fn(async () => ({ id: "group-1", name: "Wednesday Club", description: "" })),
  getOrCreateInvite: vi.fn(async () => ({ ok: false, message: "Invite unavailable." })),
}));

vi.mock("@/lib/personalized-cache", () => ({ getPrivateGroupMetadata: mocks.getPrivateGroupMetadata }));
vi.mock("@/app/actions", () => ({ getOrCreateInvite: mocks.getOrCreateInvite }));

describe("GroupInvitePage", () => {
  test("returns directly to the group landing page", async () => {
    const html = renderToStaticMarkup(
      await GroupInviteContent({ params: Promise.resolve({ groupId: "group-1" }) }),
    );

    expect(html).toContain('href="/groups/group-1"');
    expect(html).not.toContain('href="/groups/group-1/members"');
  });
});
