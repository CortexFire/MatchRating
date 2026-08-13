// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { MatchReviewActions } from "./match-review-actions";

const actionMocks = vi.hoisted(() => ({ confirmMatchRevision: vi.fn() }));
const navigationMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/app/actions", () => actionMocks);
vi.mock("next/navigation", () => ({ useRouter: () => navigationMocks }));

beforeEach(() => vi.clearAllMocks());

test("confirms the stored revision without a client refresh", async () => {
  actionMocks.confirmMatchRevision.mockResolvedValue({ ok: true, data: { revisionId: "revision-1" } });
  render(<MatchReviewActions groupId="group-1" matchId="match-1" revisionId="revision-1" canConfirm canDispute />);

  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

  await waitFor(() => expect(actionMocks.confirmMatchRevision).toHaveBeenCalledWith({
    groupId: "group-1",
    matchId: "match-1",
    revisionId: "revision-1",
    commandId: expect.any(String),
  }));
  expect(navigationMocks.refresh).not.toHaveBeenCalled();
});

test("shows an expected confirmation failure", async () => {
  actionMocks.confirmMatchRevision.mockResolvedValue({ ok: false, message: "Match revision is no longer pending." });
  render(<MatchReviewActions groupId="group-1" matchId="match-1" revisionId="revision-1" canConfirm canDispute />);

  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

  expect(await screen.findByText("Match revision is no longer pending.")).toBeTruthy();
});

test("offers correction without confirmation to an accepted-match participant", () => {
  render(<MatchReviewActions groupId="group-1" matchId="match-1" revisionId="revision-1" canConfirm={false} canDispute />);

  expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  expect(screen.getByRole("link", { name: "Dispute" }).getAttribute("href")).toBe(
    "/groups/group-1/matches/match-1/revise",
  );
});
