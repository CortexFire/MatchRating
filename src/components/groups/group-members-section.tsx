import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { PlayerRow } from "@/components/app/player-row";
import { Button } from "@/components/ui/button";
import { type AppPlayer } from "@/lib/app-data";
import { type GroupRatingHistoryData } from "@/lib/navigation-read-models";
import { GroupRatingHistoryChart } from "./group-rating-history-chart";
import styles from "./group-members-section.module.css";

export function GroupMembersSection({
  groupId,
  players,
  inviteHref,
  ratingHistory,
}: {
  groupId: string;
  players: AppPlayer[];
  inviteHref: string;
  ratingHistory: GroupRatingHistoryData;
}) {
  return (
    <section className={styles.section}>
      <Button asChild variant="secondary" className={styles.inviteButton}>
        <Link href={inviteHref}>Invite members</Link>
      </Button>
      <GroupRatingHistoryChart history={ratingHistory} />
      <details className={styles.details}>
        <summary className={styles.summary}>
          <span>Members ({players.length})</span>
          <ChevronDown className={styles.chevron} aria-hidden="true" />
        </summary>
        <div className={styles.content}>
          {players.length ? (
            <div
              role="region"
              aria-label="Group members"
              tabIndex={players.length > 5 ? 0 : undefined}
              className={styles.roster}
            >
              {players.map((player) => (
                <PlayerRow key={player.id} player={player} analyticsHref={`/groups/${groupId}/players/${player.id}/analytics`} />
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No members yet.</p>
          )}
        </div>
      </details>
    </section>
  );
}
