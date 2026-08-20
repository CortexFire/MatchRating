import { describeRating, formatRating } from "@/lib/ratings/rating-display";
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
  return (
    <span className={className}>
      <span aria-hidden="true">{formatRating(rating, rd)}</span>
      <span className={styles.srOnly}>{describeRating(rating, rd)}</span>
    </span>
  );
}
