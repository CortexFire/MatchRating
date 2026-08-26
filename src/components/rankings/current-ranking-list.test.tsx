import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { CurrentRankingList } from "./current-ranking-list";

describe("CurrentRankingList", () => {
  test("links each group ranking with position, member count, and rating", () => {
    const html = renderToStaticMarkup(
      <CurrentRankingList hasGroups rankings={[
        {
          groupId: "group-1",
          playerId: "alice",
          groupName: "Wednesday Club",
          rating: 1672,
          rd: 110.01,
          rank: 4,
          memberCount: 18,
        },
      ]} />,
    );

    expect(html).toContain("Current rankings");
    expect(html).toContain("Wednesday Club");
    expect(html).toContain("#4 of 18");
    expect(html).toContain("1672, provisional rating");
    expect(html).toContain('href="/groups/group-1/players/alice/analytics"');
    expect(html).toContain('aria-label="View analytics for Wednesday Club"');
    expect(html).not.toContain('href="/groups/group-1/rankings"');
  });

  test("shows the rankings empty state", () => {
    const html = renderToStaticMarkup(<CurrentRankingList hasGroups={false} rankings={[]} />);

    expect(html).toContain("Join a group to see your rankings.");
  });

  test("prompts an unranked group member to play a match", () => {
    const html = renderToStaticMarkup(<CurrentRankingList hasGroups rankings={[]} />);

    expect(html).toContain("Play a match to earn a ranking.");
    expect(html).not.toContain("Join a group");
  });
});
