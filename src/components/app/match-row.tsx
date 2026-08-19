import Link from "next/link";
import clsx from "clsx";
import { Badge } from "@/components/ui/badge";
import { type AppMatchSummary } from "@/lib/app-data";
import styles from "./match-row.module.css";

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
      className={styles.row}
    >
      <div className={styles.summary}>
        <div className={styles.details}>
          <div className={styles.headingRow}>
            <p className={clsx(styles.heading, heading === "format" && styles.formatHeading)}>
              {heading === "participants" ? participants : match.format}
            </p>
            {status ? <Badge className={styles.statusBadge}>{status}</Badge> : null}
          </div>
          {heading === "format" ? <p className={styles.subtitle}>{participants}</p> : null}
          {showGroupName ? <p className={styles.subtitle}>{match.groupName}</p> : null}
        </div>
        <p className={styles.score}>
          {match.games.map((game) => `${game.teamAScore}-${game.teamBScore}`).join(", ")}
        </p>
      </div>
      <div className={styles.metadata}>
        <span>{formatSubmittedAt(match.submittedAt)}</span>
        {showRatingSummary ? <span>{match.ratingSummary}</span> : null}
      </div>
    </Link>
  );
}

function displayStatus(status: AppMatchSummary["status"]) {
  if (status === "disputed") return "Disputed";
  return null;
}

function formatSubmittedAt(value: string) {
  return submittedAtFormatter.format(new Date(value));
}
