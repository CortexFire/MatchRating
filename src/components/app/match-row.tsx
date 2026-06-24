import Link from "next/link";
import { Badge } from "@/components/ui/badge";

type MatchRowData = {
  id: string;
  groupId: string;
  format: "singles" | "doubles";
  status: "Pending confirmation" | "Confirmed" | "Disputed";
  submittedAt: string;
  teamA: string[];
  teamB: string[];
  scores: string[];
  ratingDelta: string;
};

function toneForStatus(status: MatchRowData["status"]) {
  if (status === "Confirmed") {
    return "victory" as const;
  }
  return "neutral" as const;
}

export function MatchRow({ match }: { match: MatchRowData }) {
  return (
    <Link
      href={`/groups/${match.groupId}/matches/${match.id}`}
      className="block rounded-lg border border-stroke bg-surface p-3 transition hover:border-selection-stroke"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold capitalize text-ink">{match.format}</p>
            <Badge tone={toneForStatus(match.status)}>{match.status}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted">
            {match.teamA.join(" / ")} vs {match.teamB.join(" / ")}
          </p>
        </div>
        <p className="text-right text-sm font-bold text-ink">{match.scores.join(", ")}</p>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>{match.submittedAt}</span>
        <span>{match.ratingDelta}</span>
      </div>
    </Link>
  );
}
