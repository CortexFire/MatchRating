export const PROVISIONAL_RD_THRESHOLD = 110;

export function isProvisionalRating(rd: number) {
  return rd > PROVISIONAL_RD_THRESHOLD;
}

export function formatRating(rating: number, rd: number) {
  const roundedRating = Math.round(rating);
  return `${roundedRating}${isProvisionalRating(rd) ? "?" : ""}`;
}

export function describeRating(rating: number, rd: number) {
  const confidence = isProvisionalRating(rd) ? "provisional" : "established";
  return `${Math.round(rating)}, ${confidence} rating`;
}
