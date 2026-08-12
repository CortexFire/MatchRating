import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { MatchResultList } from "./match-result-list";

describe("MatchResultList", () => {
  test("links every neutral match result using the established result-card presentation", () => {
    const html = renderToStaticMarkup(
      <MatchResultList
        matches={[{
          id: "match-1",
          groupId: "group-1",
          summary: "Bea def. Alice",
          details: "Aug 7, 2026, 1:00 PM @ Club",
          score: "2 - 1",
          format: "Doubles",
        }]}
      />,
    );

    expect(html).toContain('aria-label="Match results"');
    expect(html).toContain('href="/groups/group-1/matches/match-1"');
    expect(html).toContain("Bea def. Alice");
    expect(html).toContain("Aug 7, 2026, 1:00 PM @ Club");
    expect(html).toContain("2 - 1");
    expect(html).toContain("Doubles");
    expect(html).toContain("min-h-[70px]");
    expect(html).toContain("border-muted/70");
    expect(html).toContain("bg-app-bg");
    expect(html).toContain("min-h-14");
    expect(html).toContain("min-w-[132px]");
    expect(html).toContain("border-stroke");
    expect(html).toContain("bg-surface");
  });
});
