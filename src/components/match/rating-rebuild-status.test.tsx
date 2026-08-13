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

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/groups/group-1/rating-status",
        expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
      );
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
          refreshOnComplete
        />,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  test.each([null, "completed", "failed"] as const)(
    "does not poll while the current status is %s",
    async (status) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(
        <RatingRebuildStatus
          groupId="group-1"
          jobId="55555555-5555-4555-8555-555555555555"
          status={status}
          refreshOnComplete
        />,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(navigationMocks.refresh).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  test("does not overlap an active request with another poll", async () => {
    vi.useFakeTimers();
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(<RatingRebuildStatus groupId="group-1" status="running" />);

      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveFetch(new Response(JSON.stringify({ id: "job-1", status: "running", canRetry: false })));
        await Promise.resolve();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  test("polls immediately when an active job becomes visible again", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "job-1",
      status: "running",
      canRetry: false,
    })));
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(<RatingRebuildStatus groupId="group-1" status="running" />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(fetchMock).not.toHaveBeenCalled();

      visibility.mockReturnValue("visible");
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        await Promise.resolve();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      visibility.mockRestore();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  test("does not refresh a non-rating page when its active job completes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: "job-1",
      status: "completed",
      canRetry: false,
    }))));

    try {
      render(<RatingRebuildStatus groupId="group-1" jobId="job-1" status="queued" />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(navigationMocks.refresh).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
