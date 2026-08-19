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
  correctionStartedAt: "2026-08-07T20:00:00.000Z",
  correctionUntil: "2026-09-06T20:00:00.000Z",
  submittedByUserId: "11111111-1111-4111-8111-111111111111",
  teamA: [{ id: "11111111-1111-4111-8111-111111111111", name: "Alice Tan", initials: "AT" }],
  teamB: [{ id: "22222222-2222-4222-8222-222222222222", name: "Bea Rivera", initials: "BR" }],
  games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
  winnerTeam: "A",
  ratingSummary: "Ratings applied",
  canCorrect: true,
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

  test("keeps the format heading and participant subtitle by default without a confirmed status badge", async () => {
    const { MatchRow } = await import("./match-row");
    const { getByText, queryByText } = render(<MatchRow match={match} />);

    expect(getByText("singles")).toBeTruthy();
    expect(getByText("Alice Tan vs Bea Rivera")).toBeTruthy();
    expect(getByText("Ratings applied")).toBeTruthy();
    expect(queryByText("Accepted")).toBeNull();
  });

  test("uses the full Team A versus Team B matchup as the primary heading when requested", async () => {
    const { MatchRow } = await import("./match-row");
    const doublesMatch: AppMatchSummary = {
      ...match,
      format: "doubles",
      teamA: [
        { id: "11111111-1111-4111-8111-111111111111", name: "Alice Tan", initials: "AT" },
        { id: "33333333-3333-4333-8333-333333333333", name: "Cory Shah", initials: "CS" },
      ],
      teamB: [
        { id: "22222222-2222-4222-822222222222", name: "Bea Rivera", initials: "BR" },
        { id: "44444444-4444-4444-8444-444444444444", name: "Dev Okafor", initials: "DO" },
      ],
    };
    const { getByText, queryByText } = render(<MatchRow match={doublesMatch} heading="participants" />);

    expect(getByText("Alice Tan / Cory Shah vs Bea Rivera / Dev Okafor")).toBeTruthy();
    expect(queryByText("doubles")).toBeNull();
  });

  test("omits pending review indicators while retaining the disputed badge", async () => {
    const { MatchRow } = await import("./match-row");
    const { getByText, queryByText } = render(
      <>
        <MatchRow match={{ ...match, id: "pending", status: "pending_confirmation" }} />
        <MatchRow match={{ ...match, id: "disputed", status: "disputed" }} />
        <MatchRow match={{ ...match, id: "confirmed", status: "confirmed" }} />
      </>,
    );

    expect(queryByText("Awaiting review")).toBeNull();
    expect(getByText("Disputed")).toBeTruthy();
    expect(queryByText("Accepted")).toBeNull();
  });

  test("keeps scores intact for pending matches without exposing a review indicator", async () => {
    const { MatchRow } = await import("./match-row");
    const { getByText, queryByText } = render(<MatchRow match={{ ...match, status: "pending_confirmation" }} />);

    const score = getByText("21-18");
    expect(score).toBeTruthy();
    expect(queryByText("Awaiting review")).toBeNull();
  });

  test("omits the rating summary while retaining the submission date when requested", async () => {
    const { MatchRow } = await import("./match-row");
    const { getByText, queryByText } = render(<MatchRow match={match} showRatingSummary={false} />);

    expect(queryByText("Ratings applied")).toBeNull();
    expect(getByText(/Aug 7, 2026/)).toBeTruthy();
  });
});
