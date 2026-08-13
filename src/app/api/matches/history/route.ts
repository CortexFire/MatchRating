import { listMatchHistoryPage } from "@/lib/app-data";
import { MatchHistoryInputError } from "@/lib/matches/history-pagination";

const RESPONSE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;

  try {
    const page = await listMatchHistoryPage({
      groupId: searchParams.get("groupId"),
      status: searchParams.get("status"),
      search: searchParams.get("q"),
      cursor: searchParams.get("cursor"),
    });
    return Response.json(page, { headers: RESPONSE_HEADERS });
  } catch (error) {
    if (error instanceof MatchHistoryInputError) {
      return Response.json({ message: error.message }, { status: 400, headers: RESPONSE_HEADERS });
    }

    const code = errorCode(error);
    if (code === "MR401" || (error instanceof Error && error.message === "You must be signed in to do that.")) {
      return Response.json({ message: "Unauthorized" }, { status: 401, headers: RESPONSE_HEADERS });
    }
    if (code === "MR403") {
      return Response.json({ message: "Forbidden" }, { status: 403, headers: RESPONSE_HEADERS });
    }

    return Response.json({ message: "Could not load match history" }, { status: 500, headers: RESPONSE_HEADERS });
  }
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : null;
}
