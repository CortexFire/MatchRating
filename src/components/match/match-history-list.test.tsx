// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MatchHistoryList } from "./match-history-list";

const matches = [
  {
    id: "match-1", groupId: "group-1", groupName: "Club", revisionId: "revision-1", submittedByUserId: "alice",
    status: "pending_confirmation" as const, submittedAt: "2026-08-07T20:00:00.000Z", correctionStartedAt: "2026-08-07T20:00:00.000Z", correctionUntil: "2026-09-06T20:00:00.000Z", format: "singles" as const,
    teamA: [{ id: "alice", name: "Alice Tan", initials: "AT" }], teamB: [{ id: "bea", name: "Bea Rivera", initials: "BR" }],
    games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" as const }], winnerTeam: "A" as const,
    ratingSummary: "2 rating changes", canCorrect: true, canRevise: false,
  },
  {
    id: "match-2", groupId: "group-1", groupName: "Weekend Club", revisionId: "revision-2", submittedByUserId: "cory",
    status: "disputed" as const, submittedAt: "2026-08-06T20:00:00.000Z", correctionStartedAt: "2026-08-06T20:00:00.000Z", correctionUntil: "2026-09-05T20:00:00.000Z", format: "doubles" as const,
    teamA: [{ id: "cory", name: "Cory Shah", initials: "CS" }, { id: "dev", name: "Dev Okafor", initials: "DO" }], teamB: [{ id: "eli", name: "Eli Stone", initials: "ES" }, { id: "faye", name: "Faye Kim", initials: "FK" }],
    games: [{ gameNumber: 1, teamAScore: 17, teamBScore: 21, winnerTeam: "B" as const }], winnerTeam: "B" as const,
    ratingSummary: "Ratings updating…", canCorrect: false, canRevise: false,
  },
];

describe("MatchHistoryList", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  test("uses team matchups as history card headings and exposes only all and disputed filters", () => {
    render(<MatchHistoryList initialPage={{ matches, nextCursor: null }} />);
    expect(screen.getByText(/Alice Tan vs Bea Rivera/)).toBeTruthy();
    expect(screen.getByText("Cory Shah / Dev Okafor vs Eli Stone / Faye Kim")).toBeTruthy();
    expect(screen.queryByText("singles")).toBeNull();
    expect(screen.queryByText("doubles")).toBeNull();
    expect(screen.queryByText("Accepted")).toBeNull();
    expect(screen.queryByText("Awaiting review")).toBeNull();
    expect(screen.getByRole("button", { name: "All" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disputed" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Disputed/ })).toBeTruthy();
  });

  test("does not refetch the server-rendered first page during Strict Mode mounting", async () => {
    render(<StrictMode><MatchHistoryList initialPage={{ matches, nextCursor: null }} /></StrictMode>);

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
  });

  test("filters the entire history through the server", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ matches: [matches[1]], nextCursor: null })));
    render(<MatchHistoryList initialPage={{ matches, nextCursor: null }} />);
    expect(screen.getByText(/Alice Tan vs Bea Rivera/)).toBeTruthy();
    expect(screen.getByText("Cory Shah / Dev Okafor vs Eli Stone / Faye Kim")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Disputed" }));
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/matches/history?status=disputed",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    await waitFor(() => expect(screen.queryByText(/Alice Tan vs Bea Rivera/)).toBeNull());
    expect(screen.getByText("Cory Shah / Dev Okafor vs Eli Stone / Faye Kim")).toBeTruthy();
  });

  test("debounces full-history search and includes group scope", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ matches: [matches[1]], nextCursor: null })));
    render(<MatchHistoryList initialPage={{ matches, nextCursor: null }} groupId="group-1" showGroupName />);

    expect(screen.getByText("Club")).toBeTruthy();
    expect(screen.getByText("Weekend Club")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search matches"), { target: { value: "Weekend" } });

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/matches/history?groupId=group-1&q=Weekend",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ), { timeout: 1000 });
    await waitFor(() => expect(screen.queryByText(/Alice Tan vs Bea Rivera/)).toBeNull());
    expect(screen.getByText("Cory Shah / Dev Okafor vs Eli Stone / Faye Kim")).toBeTruthy();
  });

  test("appends older matches without replacing the current page", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ matches: [matches[1]], nextCursor: null })));
    render(<MatchHistoryList initialPage={{ matches: [matches[0]], nextCursor: "older" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Load older matches" }));

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/matches/history?cursor=older",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    expect(await screen.findByText("Cory Shah / Dev Okafor vs Eli Stone / Faye Kim")).toBeTruthy();
    expect(screen.getByText(/Alice Tan vs Bea Rivera/)).toBeTruthy();
  });

  test("retains matches after load-more failure and retries", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ matches: [matches[1]], nextCursor: null })));
    render(<MatchHistoryList initialPage={{ matches: [matches[0]], nextCursor: "older" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Load older matches" }));
    expect(await screen.findByText("Could not load more matches. Try again.")).toBeTruthy();
    expect(screen.getByText(/Alice Tan vs Bea Rivera/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Load older matches" }));
    expect(await screen.findByText("Cory Shah / Dev Okafor vs Eli Stone / Faye Kim")).toBeTruthy();
  });

  test("retries failed filter replacements without reusing the previous query cursor", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ matches: [matches[1]], nextCursor: "disputed-older" })));
    render(<MatchHistoryList initialPage={{ matches: [matches[0]], nextCursor: "all-older" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Disputed" }));

    expect(await screen.findByText("Could not load match history. Try again.")).toBeTruthy();
    expect(screen.getByText(/Alice Tan vs Bea Rivera/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load older matches" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry loading history" }));

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetch)).toHaveBeenNthCalledWith(
      2,
      "/api/matches/history?status=disputed",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(await screen.findByText("Cory Shah / Dev Okafor vs Eli Stone / Faye Kim")).toBeTruthy();
    expect(screen.queryByText(/Alice Tan vs Bea Rivera/)).toBeNull();
    expect(screen.getByRole("button", { name: "Load older matches" })).toBeTruthy();
  });

  test("ignores a stale filter response that finishes after the current request", async () => {
    let resolveDisputed!: (response: Response) => void;
    let resolveAll!: (response: Response) => void;
    vi.mocked(fetch)
      .mockReturnValueOnce(new Promise((resolve) => { resolveDisputed = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveAll = resolve; }));
    render(<MatchHistoryList initialPage={{ matches, nextCursor: null }} />);

    fireEvent.click(screen.getByRole("button", { name: "Disputed" }));
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2));

    resolveAll(new Response(JSON.stringify({ matches: [matches[0]], nextCursor: null })));
    await waitFor(() => expect(screen.queryByText("Cory Shah / Dev Okafor vs Eli Stone / Faye Kim")).toBeNull());

    resolveDisputed(new Response(JSON.stringify({ matches: [matches[1]], nextCursor: null })));
    await waitFor(() => expect(screen.getByText(/Alice Tan vs Bea Rivera/)).toBeTruthy());
    expect(screen.queryByText("Cory Shah / Dev Okafor vs Eli Stone / Faye Kim")).toBeNull();
  });
});
