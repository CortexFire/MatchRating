import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import ClaimProfilePage from "./page";

const mocks = vi.hoisted(() => ({
  listClaimableGuestProfiles: vi.fn(),
}));

vi.mock("@/app/actions", () => ({
  listClaimableGuestProfiles: mocks.listClaimableGuestProfiles,
  claimGuestProfiles: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listClaimableGuestProfiles.mockResolvedValue({
    ok: true,
    data: { profiles: [{ id: "guest-1", name: "Avery Park", rating: 1500, rank: 4 }] },
  });
});

test("renders claim choices without the redundant guest-profile label", async () => {
  const html = renderToStaticMarkup(await ClaimProfilePage({ params: Promise.resolve({ groupId: "group-1" }) }));

  expect(html).toContain("Are any of these you?");
  expect(html).toContain("Avery Park");
  expect(html).not.toContain("Claiming an existing guest profile");
});
