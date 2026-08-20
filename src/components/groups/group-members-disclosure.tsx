import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { PlayerRow } from "@/components/app/player-row";
import { Button } from "@/components/ui/button";
import { type AppPlayer } from "@/lib/app-data";
import styles from "./group-members-disclosure.module.css";

export function GroupMembersDisclosure({ groupId, players, inviteHref }: { groupId: string; players: AppPlayer[]; inviteHref: string }) {
  return (
    <section className={styles.section}>
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
      <Button asChild variant="secondary" className={styles.inviteButton}>
        <Link href={inviteHref}>Invite members</Link>
      </Button>
    </section>
  );
}
