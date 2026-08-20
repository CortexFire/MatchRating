import { describe, expect, test } from "vitest";
import {
  describeRating,
  formatRating,
  isProvisionalRating,
} from "./rating-display";

describe("rating display", () => {
  test.each([
    { rd: 109.99, provisional: false, display: "1540" },
    { rd: 110, provisional: false, display: "1540" },
    { rd: 110.01, provisional: true, display: "1540?" },
  ])("derives provisional state from the unrounded RD $rd", ({ rd, provisional, display }) => {
    expect(isProvisionalRating(rd)).toBe(provisional);
    expect(formatRating(1539.6, rd)).toBe(display);
  });

  test("describes both confidence states for assistive technology", () => {
    expect(describeRating(1539.6, 110.01)).toBe("1540, provisional rating");
    expect(describeRating(1539.6, 110)).toBe("1540, established rating");
  });
});
