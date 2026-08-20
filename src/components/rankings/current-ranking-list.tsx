import Link from "next/link";
import { type AppCurrentRanking } from "@/lib/app-data";
import styles from "./current-ranking-list.module.css";

export function CurrentRankingList({ rankings }: { rankings: AppCurrentRanking[] }) {
  return (
    <section className={styles.section}>
      <h2>Current rankings</h2>
      {rankings.length ? (
        <div className={styles.list}>
          {rankings.map((ranking) => (
            <Link
              key={ranking.groupId}
              href={`/groups/${ranking.groupId}/players/${ranking.playerId}/analytics`}
              aria-label={`View analytics for ${ranking.groupName}`}
              className={styles.card}
            >
              <span className={styles.details}>
                <span className={styles.groupName}>{ranking.groupName}</span>
                <span className={styles.position}>#{ranking.rank} of {ranking.memberCount}</span>
              </span>
              <span className={styles.rating}>{ranking.rating}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>
          Join a group to see your rankings.
        </p>
      )}
    </section>
  );
}
