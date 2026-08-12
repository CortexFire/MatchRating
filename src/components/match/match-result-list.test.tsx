import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { MatchResultList } from "./match-result-list";

describe("MatchResultList", () => {
  const match = {
    id: "match-1",
    groupId: "group-1",
    summary: "Bea def. Alice",
    details: "Aug 7, 2026, 1:00 PM @ Club",
    submittedAt: "Aug 7, 2026, 1:00 PM",
    groupName: "Club",
    score: "1 - 0",
    singleGameScore: "21 - 18",
    format: "Doubles",
  };

  test("preserves the established result-card presentation by default", () => {
    const html = renderToStaticMarkup(
      <MatchResultList matches={[match]} />,
    );

    expect(html).toContain('aria-label="Match results"');
    expect(html).toContain('href="/groups/group-1/matches/match-1"');
    expect(html).toContain("Bea def. Alice");
    expect(html).toContain("Aug 7, 2026, 1:00 PM @ Club");
    expect(html).toContain("1 - 0");
    expect(html).not.toContain("21 - 18");
    expect(html).toContain("Doubles");
    expect(html).toContain("min-h-[70px]");
    expect(html).toContain("border-muted/70");
    expect(html).toContain("bg-app-bg");
    expect(html).toContain("min-h-14");
    expect(html).toContain("min-w-[132px]");
    expect(html).toContain("border-stroke");
    expect(html).toContain("bg-surface");
  });

  test("renders Home latest results with design-compliant neutral cards and one-set points", () => {
    const html = renderToStaticMarkup(
      <MatchResultList matches={[match]} presentation="latest" />,
    );

    expect(html).toContain('aria-label="Latest match results"');
    expect(html).toContain('href="/groups/group-1/matches/match-1"');
    expect(html).toContain("Bea def. Alice");
    expect(html).toContain("Club");
    expect(html).toContain("Aug 7, 2026, 1:00 PM");
    expect(html).toContain("21 - 18");
    expect(html).not.toContain("1 - 0");
    expect(html).toContain("grid-cols-[minmax(0,1fr)_96px]");
    expect(html).toContain("flex flex-col gap-3");
    expect(html).toContain("border-stroke");
    expect(html).toContain("bg-surface");
    expect(html).toContain("p-3");
    expect(html).toContain("text-ink");
    expect(html).toContain("text-ink/70");
    expect(html).toContain("w-24");
    expect(html).toContain("tabular-nums");
    expect(html).toContain("focus-visible:outline-action");
    expect(html).not.toContain("mx-2.5");
    expect(html).not.toContain("bg-victory");
    expect(html).not.toContain("border-victory-stroke");
  });
});
