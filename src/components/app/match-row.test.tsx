// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { type AppMatchSummary } from "@/lib/app-data";

const match: AppMatchSummary = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  groupId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  groupName: "Wednesday Club",
  revisionId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  format: "singles",
  status: "confirmed",
  submittedAt: "2026-08-07T20:00:00.000Z",
  reviewStartedAt: "2026-08-07T20:00:00.000Z",
  disputeUntil: "2026-09-06T20:00:00.000Z",
  submittedByUserId: "11111111-1111-4111-8111-111111111111",
  teamA: [{ id: "11111111-1111-4111-8111-111111111111", name: "Alice Tan", initials: "AT" }],
  teamB: [{ id: "22222222-2222-4222-8222-222222222222", name: "Bea Rivera", initials: "BR" }],
  games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
  winnerTeam: "A",
  ratingSummary: "Ratings applied",
  canConfirm: false,
  canDispute: true,
  canRevise: false,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("MatchRow", () => {
  test("creates its Los Angeles date formatter once per module", async () => {
    const originalDateTimeFormat = Intl.DateTimeFormat;
    let formatterCalls = 0;
    class DateTimeFormat {
      constructor(...args: unknown[]) {
        formatterCalls += 1;
        return Reflect.construct(originalDateTimeFormat, args) as Intl.DateTimeFormat;
      }
    }
    vi.stubGlobal("Intl", { ...Intl, DateTimeFormat });
    const { MatchRow } = await import("./match-row");
    const { rerender } = render(<MatchRow match={match} />);

    rerender(<MatchRow match={match} />);

    expect(formatterCalls).toBe(1);
  });

  test("labels a confirmed match as accepted", async () => {
    const { MatchRow } = await import("./match-row");
    const { getByText } = render(<MatchRow match={match} />);

    expect(getByText("Accepted")).toBeTruthy();
  });
});
