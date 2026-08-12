import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { type AppMatchSummary } from "@/lib/app-data";

const submittedAtFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Los_Angeles",
});

export function MatchRow({
  match,
  showGroupName = false,
  heading = "format",
  showRatingSummary = true,
}: {
  match: AppMatchSummary;
  showGroupName?: boolean;
  heading?: "format" | "participants";
  showRatingSummary?: boolean;
}) {
  const participants = `${match.teamA.map((player) => player.name).join(" / ")} vs ${match.teamB
    .map((player) => player.name)
    .join(" / ")}`;
  const status = displayStatus(match.status);

  return (
    <Link
      href={`/groups/${match.groupId}/matches/${match.id}`}
      className="block rounded-lg border border-stroke bg-surface p-3 transition hover:border-selection-stroke"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-sm font-semibold text-ink${heading === "format" ? " capitalize" : ""}`}>
              {heading === "participants" ? participants : match.format}
            </p>
            {status ? <Badge className="shrink-0 whitespace-nowrap">{status}</Badge> : null}
          </div>
          {heading === "format" ? <p className="mt-1 truncate text-xs text-muted">{participants}</p> : null}
          {showGroupName ? <p className="mt-1 truncate text-xs text-muted">{match.groupName}</p> : null}
        </div>
        <p className="shrink-0 whitespace-nowrap text-right text-sm font-bold tabular-nums text-ink">
          {match.games.map((game) => `${game.teamAScore}-${game.teamBScore}`).join(", ")}
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>{formatSubmittedAt(match.submittedAt)}</span>
        {showRatingSummary ? <span>{match.ratingSummary}</span> : null}
      </div>
    </Link>
  );
}

function displayStatus(status: AppMatchSummary["status"]) {
  if (status === "pending_confirmation") return "Awaiting review";
  if (status === "disputed") return "Disputed";
  return null;
}

function formatSubmittedAt(value: string) {
  return submittedAtFormatter.format(new Date(value));
}
