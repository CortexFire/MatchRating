import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { RatingValue } from "./rating-value";

describe("RatingValue", () => {
  test("renders a provisional marker with an accessible confidence description", () => {
    const html = renderToStaticMarkup(<RatingValue rating={1539.6} rd={110.01} />);

    expect(html).toContain('aria-hidden="true">1540?</span>');
    expect(html).toContain("1540, provisional rating");
  });

  test("renders an established rating without the marker", () => {
    const html = renderToStaticMarkup(<RatingValue rating={1539.6} rd={110} />);

    expect(html).toContain('aria-hidden="true">1540</span>');
    expect(html).toContain("1540, established rating");
    expect(html).not.toContain("1540?");
  });
});
