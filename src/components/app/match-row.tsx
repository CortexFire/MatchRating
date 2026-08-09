import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { type AppMatchSummary } from "@/lib/app-data";

function toneForStatus(status: AppMatchSummary["status"]) {
  if (status === "confirmed") {
    return "victory" as const;
  }
  return "neutral" as const;
}

export function MatchRow({ match }: { match: AppMatchSummary }) {
  return (
    <Link
      href={`/groups/${match.groupId}/matches/${match.id}`}
      className="block rounded-lg border border-stroke bg-surface p-3 transition hover:border-selection-stroke"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold capitalize text-ink">{match.format}</p>
            <Badge tone={toneForStatus(match.status)}>{displayStatus(match.status)}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted">
            {match.teamA.map((player) => player.name).join(" / ")} vs {match.teamB.map((player) => player.name).join(" / ")}
          </p>
        </div>
        <p className="text-right text-sm font-bold text-ink">
          {match.games.map((game) => `${game.teamAScore}-${game.teamBScore}`).join(", ")}
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>{formatSubmittedAt(match.submittedAt)}</span>
        <span>{match.ratingSummary}</span>
      </div>
    </Link>
  );
}

function displayStatus(status: AppMatchSummary["status"]) {
  if (status === "pending_confirmation") return "Pending confirmation";
  if (status === "confirmed") return "Confirmed";
  return "Disputed";
}

function formatSubmittedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}
