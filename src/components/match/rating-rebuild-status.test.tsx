// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { RatingRebuildStatus } from "./rating-rebuild-status";

const navigationMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigationMocks }));

describe("RatingRebuildStatus", () => {
  beforeEach(() => {
    navigationMocks.refresh.mockReset();
  });

  test("tells players that saved match ratings are updating", () => {
    render(<RatingRebuildStatus groupId="group-1" status="queued" />);
    expect(screen.getByText("Match saved. Ratings updating…")).toBeTruthy();
  });

  test("shows a failed rebuild notice without retry guidance", () => {
    render(
      <RatingRebuildStatus
        groupId="group-1"
        jobId="44444444-4444-4444-8444-444444444444"
        status="failed"
        canRetry={false}
      />,
    );
    expect(screen.getByText("Match saved, but ratings need attention.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry ratings" })).toBeNull();
  });

  test("does not expose a retry control when a failed rebuild is retryable", () => {
    render(
      <RatingRebuildStatus
        groupId="group-1"
        jobId="44444444-4444-4444-8444-444444444444"
        status="failed"
        canRetry
      />,
    );

    expect(screen.queryByRole("button", { name: "Retry ratings" })).toBeNull();
  });

  test("keeps the retry control hidden when a queued job fails while polling", async () => {
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
      expect(screen.queryByRole("button", { name: "Retry ratings" })).toBeNull();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  test("refreshes player data exactly once when a queued rebuild completes", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "55555555-5555-4555-8555-555555555555",
      status: "completed",
      canRetry: false,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(
        <RatingRebuildStatus
          groupId="group-1"
          jobId="55555555-5555-4555-8555-555555555555"
          status="queued"
        />,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  test("discovers a newer completed rebuild while the current status is idle", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "66666666-6666-4666-8666-666666666666",
      status: "completed",
      canRetry: false,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(
        <RatingRebuildStatus
          groupId="group-1"
          jobId="55555555-5555-4555-8555-555555555555"
          status="completed"
        />,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(fetchMock).toHaveBeenCalledWith("/api/groups/group-1/rating-status", { cache: "no-store" });
      expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
