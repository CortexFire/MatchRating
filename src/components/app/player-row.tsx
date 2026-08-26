import Link from "next/link";
import clsx from "clsx";
import { AvatarInitials } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RatingValue } from "@/components/ratings/rating-value";
import { type AppPlayer } from "@/lib/app-data";
import styles from "./player-row.module.css";

export function PlayerRow({ player, analyticsHref }: { player: AppPlayer; analyticsHref: string }) {
  const isUnranked = player.gamesPlayed === 0;
  const performanceVariationDescription =
    `Estimated one-standard-deviation match-performance variation: plus or minus ${player.performanceSd} rating points.`;
  const content = (
    <>
      <Badge
        aria-label={isUnranked ? "Unranked" : `Rank ${player.rank}`}
        className={styles.rankBadge}
      >
        {isUnranked ? "Unranked" : `#${player.rank}`}
      </Badge>
      <AvatarInitials initials={player.initials} className={styles.avatar} />
      <div className={styles.playerDetails}>
        <div className={styles.nameRow}>
          <h3>{player.name}</h3>
          <Badge>{player.role}</Badge>
        </div>
        <p className={styles.games}>{player.gamesPlayed} games</p>
      </div>
      {isUnranked ? null : (
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
      )}
    </>
  );

  return (
    <article
      className={clsx(styles.row, isUnranked && styles.unrankedRow)}
      aria-label={isUnranked ? `${player.name}, unranked, 0 games` : undefined}
    >
      {isUnranked ? (
        <div className={styles.unrankedContent}>{content}</div>
      ) : (
        <Link href={analyticsHref} aria-label={`View analytics for ${player.name}`} className={styles.link}>
          {content}
        </Link>
      )}
    </article>
  );
}
