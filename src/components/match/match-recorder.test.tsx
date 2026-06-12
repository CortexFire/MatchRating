import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { demoPlayers } from "../../lib/demo-data";
import { MatchRecorder } from "./match-recorder";

describe("MatchRecorder", () => {
  test("renders a disputed match as the initial recording state", () => {
    const html = renderToStaticMarkup(
      <MatchRecorder
        players={demoPlayers}
        initialMatch={{
          format: "doubles",
          teamAUserIds: ["bea", "gia"],
          teamBUserIds: ["alice", "henry"],
          games: [
            { teamAScore: 18, teamBScore: 21 },
            { teamAScore: 19, teamBScore: 21 },
          ],
        }}
      />,
    );

    expect(html).toContain("Bea");
    expect(html).toContain("Gia");
    expect(html).toContain("Alice");
    expect(html).toContain("Henry");
    expect(html).toContain("Set 1 Team A 18 Loss");
    expect(html).toContain("Set 1 Team B 21 Win");
    expect(html).toContain("Set 2 Team A 19 Loss");
    expect(html).toContain("Set 2 Team B 21 Win");
  });
});
