import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import GroupPage from "./page";

describe("GroupPage", () => {
  test("links the active match to a prefilled recording route", async () => {
    const html = renderToStaticMarkup(
      await GroupPage({ params: Promise.resolve({ groupId: "demo" }) }),
    );

    expect(html).toContain(
      'href="/groups/demo/matches/new?format=doubles&amp;teamA=alice%2Ccory&amp;teamB=bea%2Cdev&amp;scores=11-8"',
    );
  });
});
