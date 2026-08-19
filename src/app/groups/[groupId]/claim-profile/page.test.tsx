import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { ClaimProfileContent } from "./page";

const mocks = vi.hoisted(() => ({
  listClaimableGuestProfiles: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/app/actions", () => ({
  listClaimableGuestProfiles: mocks.listClaimableGuestProfiles,
  claimGuestProfiles: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listClaimableGuestProfiles.mockResolvedValue({
    ok: true,
    data: { profiles: [{ id: "guest-1", name: "Avery Park", rating: 1500, rank: 4 }] },
  });
});

test("renders claim choices without the redundant guest-profile label", async () => {
  const html = renderToStaticMarkup(await ClaimProfileContent({ params: Promise.resolve({ groupId: "group-1" }) }));

  expect(html).toContain("Are any of these you?");
  expect(html).toContain("Avery Park");
  expect(html).not.toContain("Claiming an existing guest profile");
});

test("redirects home when claimable profiles load successfully but are empty", async () => {
  mocks.listClaimableGuestProfiles.mockResolvedValue({ ok: true, data: { profiles: [] } });

  await expect(ClaimProfileContent({ params: Promise.resolve({ groupId: "group-1" }) })).rejects.toThrow("redirect:/home");
});

test("redirects to the group when loading claimable profiles fails", async () => {
  mocks.listClaimableGuestProfiles.mockResolvedValue({ ok: false, message: "Unable to load profiles" });

  await expect(ClaimProfileContent({ params: Promise.resolve({ groupId: "group-1" }) })).rejects.toThrow("redirect:/groups/group-1");
});
