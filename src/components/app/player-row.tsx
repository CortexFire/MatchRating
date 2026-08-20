import Link from "next/link";
import { AvatarInitials } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RatingValue } from "@/components/ratings/rating-value";
import { type AppPlayer } from "@/lib/app-data";
import styles from "./player-row.module.css";

export function PlayerRow({ player, analyticsHref }: { player: AppPlayer; analyticsHref: string }) {
  const performanceVariationDescription =
    `Estimated one-standard-deviation match-performance variation: plus or minus ${player.performanceSd} rating points.`;

  return (
    <article className={styles.row}>
      <Link href={analyticsHref} aria-label={`View analytics for ${player.name}`} className={styles.link}>
        <Badge aria-label={`Rank ${player.rank}`} className={styles.rankBadge}>#{player.rank}</Badge>
        <AvatarInitials initials={player.initials} className={styles.avatar} />
        <div className={styles.playerDetails}>
          <div className={styles.nameRow}>
            <h3>{player.name}</h3>
            <Badge>{player.role}</Badge>
          </div>
          <p className={styles.games}>{player.gamesPlayed} games</p>
        </div>
        <div className={styles.rating}>
          <RatingValue rating={player.rating} rd={player.rd} className={styles.ratingValue} />
          <p
            aria-label={performanceVariationDescription}
            title={performanceVariationDescription}
            className={styles.performanceVariation}
          >
            ± {player.performanceSd}
          </p>
        </div>
      </Link>
    </article>
  );
}
