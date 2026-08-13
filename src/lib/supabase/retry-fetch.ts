const RETRY_DELAY_MS = 100;
const RETRYABLE_METHODS = new Set(["GET", "HEAD"]);

type PostgrestErrorBody = {
  code?: unknown;
  message?: unknown;
};

/**
 * Supabase converts opaque secret keys into short-lived internal JWTs before
 * forwarding requests to PostgREST. A rare clock disagreement between that
 * gateway and PostgREST can make the JWT appear to have been issued in the
 * future. Retry only this exact failure, once, for idempotent reads so ordinary
 * authentication failures stay visible and writes can never be duplicated.
 */
export function createPostgrestFutureJwtRetryFetch(baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const method = getRequestMethod(input, init);
    const response = await baseFetch(input, init);

    if (!RETRYABLE_METHODS.has(method) || !(await isFutureJwtFailure(response))) {
      return response;
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return baseFetch(input, init);
  };
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  return method.toUpperCase();
}

async function isFutureJwtFailure(response: Response) {
  if (response.status !== 401) {
    return false;
  }

  let body: unknown;

  try {
    body = await response.clone().json();
  } catch {
    return false;
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return false;
  }

  const error = body as PostgrestErrorBody;
  return error.code === "PGRST303" && error.message === "JWT issued at future";
}
