// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { RatingRebuildStatus } from "./rating-rebuild-status";

describe("RatingRebuildStatus", () => {
  test("tells players that saved match ratings are updating", () => {
    render(<RatingRebuildStatus groupId="group-1" status="queued" />);
    expect(screen.getByText("Match saved. Ratings updating…")).toBeTruthy();
  });

  test("tells members that an admin can retry a failed rebuild", () => {
    render(
      <RatingRebuildStatus
        groupId="group-1"
        jobId="44444444-4444-4444-8444-444444444444"
        status="failed"
        canRetry={false}
      />,
    );
    expect(screen.getByText("Match saved, but ratings need attention.")).toBeTruthy();
    expect(screen.getByText("An admin can retry the rating update.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry ratings" })).toBeNull();
  });

  test("lets an admin retry with one stable client command ID", async () => {
    const retryAction = vi.fn()
      .mockResolvedValueOnce({ ok: false as const, message: "Temporary dispatch failure" })
      .mockResolvedValueOnce({
        ok: true as const,
        data: {
          ratingJobId: "44444444-4444-4444-8444-444444444444",
          ratingStatus: "queued" as const,
        },
      });
    render(
      <RatingRebuildStatus
        groupId="group-1"
        jobId="44444444-4444-4444-8444-444444444444"
        status="failed"
        canRetry
        retryAction={retryAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry ratings" }));

    await screen.findByRole("alert");
    const firstCommandId = retryAction.mock.calls[0][0].commandId;
    expect(retryAction).toHaveBeenCalledWith({
      jobId: "44444444-4444-4444-8444-444444444444",
      commandId: expect.any(String),
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry ratings" }));

    await waitFor(() => expect(retryAction).toHaveBeenCalledTimes(2));
    expect(retryAction.mock.calls[1][0].commandId).toBe(firstCommandId);
    expect(screen.getByText("Match saved. Ratings updating…")).toBeTruthy();
  });

  test("reveals the retry control when a queued admin job fails while polling", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "55555555-5555-4555-8555-555555555555",
      status: "failed",
      canRetry: true,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(
        <RatingRebuildStatus
          groupId="group-1"
          jobId="44444444-4444-4444-8444-444444444444"
          status="queued"
          canRetry={false}
        />,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(fetchMock).toHaveBeenCalledWith("/api/groups/group-1/rating-status", { cache: "no-store" });
      expect(screen.getByRole("button", { name: "Retry ratings" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
