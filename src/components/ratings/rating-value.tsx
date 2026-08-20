import { describeRating, formatRating, isProvisionalRating } from "@/lib/ratings/rating-display";
import styles from "./rating-value.module.css";

export function RatingValue({
  rating,
  rd,
  className,
}: {
  rating: number;
  rd: number;
  className?: string;
}) {
  const formattedRating = formatRating(rating, rd);
  const provisional = isProvisionalRating(rd);

  return (
    <span className={className}>
      <span aria-hidden="true">
        {provisional ? formattedRating.slice(0, -1) : formattedRating}
        {provisional ? <span className={styles.provisionalMarker}>?</span> : null}
      </span>
      <span className={styles.srOnly}>{describeRating(rating, rd)}</span>
    </span>
  );
}
