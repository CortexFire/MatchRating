import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createPostgrestFutureJwtRetryFetch } from "./retry-fetch";

const requestUrl = "https://supabase.example.com/rest/v1/profiles";

function futureJwtResponse() {
  return Response.json(
    {
      code: "PGRST303",
      details: null,
      hint: null,
      message: "JWT issued at future",
    },
    { status: 401 },
  );
}

function successResponse() {
  return Response.json([{ id: "profile-1" }]);
}

describe("createPostgrestFutureJwtRetryFetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns successful reads without scheduling a retry", async () => {
    const success = successResponse();
    const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(success);
    const retryFetch = createPostgrestFutureJwtRetryFetch(baseFetch);

    const response = await retryFetch(requestUrl, { method: "GET" });

    expect(response).toBe(success);
    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("retries an exact GET clock-skew failure once after 100 ms", async () => {
    const success = successResponse();
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(futureJwtResponse())
      .mockResolvedValueOnce(success);
    const retryFetch = createPostgrestFutureJwtRetryFetch(baseFetch);

    const responsePromise = retryFetch(requestUrl, { method: "GET" });
    await vi.advanceTimersByTimeAsync(99);
    expect(baseFetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    const response = await responsePromise;

    expect(response).toBe(success);
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });

  test("retries an exact HEAD clock-skew failure", async () => {
    const request = new Request(requestUrl, { method: "HEAD" });
    const success = new Response(null, { status: 200 });
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(futureJwtResponse())
      .mockResolvedValueOnce(success);
    const retryFetch = createPostgrestFutureJwtRetryFetch(baseFetch);

    const responsePromise = retryFetch(request);
    await vi.advanceTimersByTimeAsync(100);

    await expect(responsePromise).resolves.toBe(success);
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });

  test("treats an omitted method as GET", async () => {
    const success = successResponse();
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(futureJwtResponse())
      .mockResolvedValueOnce(success);
    const retryFetch = createPostgrestFutureJwtRetryFetch(baseFetch);

    const responsePromise = retryFetch(requestUrl);
    await vi.advanceTimersByTimeAsync(100);

    await expect(responsePromise).resolves.toBe(success);
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });

  test.each(["POST", "PUT", "PATCH", "DELETE"])(
    "does not retry %s requests",
    async (method) => {
      const failure = futureJwtResponse();
      const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(failure);
      const retryFetch = createPostgrestFutureJwtRetryFetch(baseFetch);

      const response = await retryFetch(requestUrl, { method });

      expect(response).toBe(failure);
      expect(baseFetch).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  test.each([
    {
      name: "status",
      status: 403,
      body: { code: "PGRST303", message: "JWT issued at future" },
    },
    {
      name: "code",
      status: 401,
      body: { code: "PGRST301", message: "JWT issued at future" },
    },
    {
      name: "message",
      status: 401,
      body: { code: "PGRST303", message: "JWT claims validation failed" },
    },
  ])("does not retry when the $name differs", async ({ status, body }) => {
    const failure = Response.json(body, { status });
    const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(failure);
    const retryFetch = createPostgrestFutureJwtRetryFetch(baseFetch);

    const response = await retryFetch(requestUrl, { method: "GET" });

    expect(response).toBe(failure);
    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("returns a non-JSON 401 unchanged with its body readable", async () => {
    const failure = new Response("not json", {
      status: 401,
      headers: { "content-type": "text/plain" },
    });
    const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(failure);
    const retryFetch = createPostgrestFutureJwtRetryFetch(baseFetch);

    const response = await retryFetch(requestUrl, { method: "GET" });

    expect(response).toBe(failure);
    await expect(response.text()).resolves.toBe("not json");
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  test.each([null, "unauthorized", []])(
    "returns a 401 with non-object JSON unchanged",
    async (body) => {
      const failure = Response.json(body, { status: 401 });
      const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(failure);
      const retryFetch = createPostgrestFutureJwtRetryFetch(baseFetch);

      const response = await retryFetch(requestUrl, { method: "GET" });

      expect(response).toBe(failure);
      await expect(response.json()).resolves.toEqual(body);
      expect(baseFetch).toHaveBeenCalledTimes(1);
    },
  );

  test("returns the second failure without retrying a third time", async () => {
    const secondFailure = futureJwtResponse();
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(futureJwtResponse())
      .mockResolvedValueOnce(secondFailure);
    const retryFetch = createPostgrestFutureJwtRetryFetch(baseFetch);

    const responsePromise = retryFetch(requestUrl, { method: "GET" });
    await vi.advanceTimersByTimeAsync(100);
    const response = await responsePromise;
    await vi.runAllTimersAsync();

    expect(response).toBe(secondFailure);
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });

  test("preserves the original input and request options when retrying", async () => {
    const controller = new AbortController();
    const headers = new Headers({ "x-request-id": "request-1" });
    const init: RequestInit = {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "manual",
    };
    const success = successResponse();
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(futureJwtResponse())
      .mockResolvedValueOnce(success);
    const retryFetch = createPostgrestFutureJwtRetryFetch(baseFetch);

    const responsePromise = retryFetch(requestUrl, init);
    await vi.advanceTimersByTimeAsync(100);
    await responsePromise;

    expect(baseFetch.mock.calls).toEqual([
      [requestUrl, init],
      [requestUrl, init],
    ]);
  });

  test("passes network failures through without retrying", async () => {
    const networkError = new TypeError("fetch failed");
    const baseFetch = vi.fn<typeof fetch>().mockRejectedValue(networkError);
    const retryFetch = createPostgrestFutureJwtRetryFetch(baseFetch);

    await expect(retryFetch(requestUrl, { method: "GET" })).rejects.toBe(networkError);
    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
