// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { demoPlayers } from "../../lib/demo-data";
import { MobileShell } from "../app/mobile-shell";
import { MatchRecorder } from "./match-recorder";

const editableDoublesMatch = {
  format: "doubles" as const,
  teamAUserIds: ["alice"],
  teamBUserIds: ["bea"],
  games: [{ teamAScore: 21, teamBScore: 18 }],
};

function openPlayerSelect(slotLabel = "Team B empty player slot 2") {
  render(<MatchRecorder players={demoPlayers} initialMatch={editableDoublesMatch} />);

  fireEvent.click(screen.getByLabelText(slotLabel));
}

describe("MatchRecorder", () => {
  test("renders a disputed match as the initial recording state", () => {
    render(
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

    expect(screen.getByText("Bea")).toBeTruthy();
    expect(screen.getByText("Gia")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Henry")).toBeTruthy();
    expect((screen.getByLabelText("Set 1 Team A score") as HTMLInputElement).value).toBe("18");
    expect((screen.getByLabelText("Set 1 Team B score") as HTMLInputElement).value).toBe("21");
    expect((screen.getByLabelText("Set 2 Team A score") as HTMLInputElement).value).toBe("19");
    expect((screen.getByLabelText("Set 2 Team B score") as HTMLInputElement).value).toBe("21");
    expect(screen.getByRole("button", { name: "Mark Set 1 Team B as winner" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Mark Set 2 Team B as winner" }).getAttribute("aria-pressed")).toBe("true");
  });

  test("opens full-screen Player Select from an empty player slot", () => {
    openPlayerSelect();

    expect(screen.getByRole("heading", { name: "Player Select" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Select Team B/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add players" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("keeps draft player changes in Player Select until Add players is clicked", () => {
    openPlayerSelect();

    fireEvent.click(screen.getByRole("button", { name: "Select Dev Okafor" }));

    expect(screen.getByLabelText("Remove Dev Okafor from draft Team B")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Match Recording" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Select Team A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Select Henry Park" }));
    fireEvent.click(screen.getByRole("button", { name: "Add players" }));

    expect(screen.getByRole("heading", { name: "Match Recording" })).toBeTruthy();
    expect(screen.getByText("Dev")).toBeTruthy();
  });

  test("discards draft changes when Player Select is canceled", () => {
    openPlayerSelect();

    fireEvent.click(screen.getByRole("button", { name: "Select Dev Okafor" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("heading", { name: "Match Recording" })).toBeTruthy();
    expect(screen.getByLabelText("Team B empty player slot 2")).toBeTruthy();
    expect(screen.queryByText("Dev")).toBeNull();
  });

  test("commits draft players for both teams when Add players is clicked", () => {
    openPlayerSelect("Team A empty player slot 2");

    fireEvent.click(screen.getByRole("button", { name: "Select Dev Okafor" }));
    fireEvent.click(screen.getByRole("button", { name: /Select Team B/ }));
    fireEvent.click(screen.getByRole("button", { name: "Select Henry Park" }));
    fireEvent.click(screen.getByRole("button", { name: "Add players" }));

    expect(screen.getByRole("heading", { name: "Match Recording" })).toBeTruthy();
    expect(screen.getByText("Dev")).toBeTruthy();
    expect(screen.getByText("Henry")).toBeTruthy();
  });

  test("switches the active draft team from the team preview", () => {
    openPlayerSelect("Team A empty player slot 2");

    fireEvent.click(screen.getByRole("button", { name: /Select Team B/ }));
    fireEvent.click(screen.getByRole("button", { name: "Select Henry Park" }));

    expect(screen.getByLabelText("Remove Henry Park from draft Team B")).toBeTruthy();
    expect(screen.queryByLabelText("Remove Henry Park from draft Team A")).toBeNull();
  });

  test("disables additional available players when a singles draft team is full", () => {
    render(
      <MatchRecorder
        players={demoPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: [],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 19 }],
        }}
      />,
    );

    fireEvent.click(screen.getByLabelText("Team A empty player slot 1"));
    fireEvent.click(screen.getByRole("button", { name: "Select Finn Liu" }));

    expect(screen.getByLabelText("Remove Finn Liu from draft Team A")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Select Dev Okafor" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText("Team A empty player slot 2")).toBeNull();
  });

  test("prevents selecting the same player across both draft teams", () => {
    openPlayerSelect("Team A empty player slot 2");

    fireEvent.click(screen.getByRole("button", { name: "Select Dev Okafor" }));
    fireEvent.click(screen.getByRole("button", { name: /Select Team B/ }));

    expect((screen.getByRole("button", { name: "Already assigned to Team A: Dev Okafor" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText("Draft Team A player Dev Okafor")).toBeTruthy();
    expect(screen.queryByLabelText("Draft Team B player Dev Okafor")).toBeNull();
  });

  test("filters Player Select rows by player name and initials", () => {
    openPlayerSelect();

    const search = screen.getByLabelText("Search for a player");

    fireEvent.change(search, { target: { value: "HP" } });
    expect(screen.getByRole("button", { name: "Select Henry Park" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Select Alice Tan" })).toBeNull();

    fireEvent.change(search, { target: { value: "emi" } });
    expect(screen.getByRole("button", { name: "Select Emi Wilson" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Select Henry Park" })).toBeNull();
  });

  test("filters Player Select rows by selected, all, active, and inactive players", () => {
    openPlayerSelect("Team A empty player slot 2");

    fireEvent.click(screen.getByRole("button", { name: "Select Dev Okafor" }));

    fireEvent.click(screen.getByRole("button", { name: "Filter Selected" }));
    expect(screen.getByText("Dev Okafor")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Select Henry Park" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Filter All" }));
    expect(screen.getByRole("button", { name: "Select Henry Park" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Filter Active" }));
    expect(screen.getByRole("button", { name: "Select Henry Park" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Select Alice Tan" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Filter Inactive" }));
    expect(screen.getByRole("button", { name: "Remove Alice Tan from draft Team A" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select Emi Wilson" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Select Henry Park" })).toBeNull();
  });

  test("keeps non-active players selectable while showing their status label", () => {
    render(
      <MatchRecorder
        players={demoPlayers}
        initialMatch={{
          format: "doubles",
          teamAUserIds: ["cory"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
      />,
    );

    fireEvent.click(screen.getByLabelText("Team B empty player slot 2"));
    fireEvent.click(screen.getByRole("button", { name: "Filter Inactive" }));

    expect(screen.getAllByText("Pending review").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Select Alice Tan" }));

    expect(screen.getByLabelText("Remove Alice Tan from draft Team B")).toBeTruthy();
  });


  test("toggles a selected active-team player back out of the draft", () => {
    openPlayerSelect("Team A empty player slot 2");

    fireEvent.click(screen.getByRole("button", { name: "Select Dev Okafor" }));
    expect(screen.getByLabelText("Draft Team A player Dev Okafor")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove Dev Okafor from draft Team A" }));

    expect(screen.queryByLabelText("Draft Team A player Dev Okafor")).toBeNull();
    expect(screen.getByRole("button", { name: "Select Dev Okafor" })).toBeTruthy();
  });

  test("enables Add players only after both draft teams are complete", () => {
    openPlayerSelect();

    const addPlayers = screen.getByRole("button", { name: "Add players" }) as HTMLButtonElement;
    expect(addPlayers.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Select Dev Okafor" }));
    expect(addPlayers.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Select Team A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Select Henry Park" }));

    expect(addPlayers.disabled).toBe(false);
  });

  test("disables additional available players when a doubles draft team is full", () => {
    openPlayerSelect("Team A empty player slot 2");

    fireEvent.click(screen.getByRole("button", { name: "Select Dev Okafor" }));

    expect((screen.getByRole("button", { name: "Select Henry Park" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Select Finn Liu" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("keeps bottom navigation mounted while Player Select is open", () => {
    render(
      <MobileShell active="Record">
        <MatchRecorder players={demoPlayers} initialMatch={editableDoublesMatch} />
      </MobileShell>,
    );

    fireEvent.click(screen.getByLabelText("Team B empty player slot 2"));

    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Record" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Groups" })).toBeTruthy();
  });

  test("allows scores to be changed with number inputs", () => {
    render(<MatchRecorder players={demoPlayers} />);

    const teamBScore = screen.getByLabelText("Set 1 Team B score") as HTMLInputElement;
    fireEvent.change(teamBScore, { target: { value: "22" } });

    expect(teamBScore.value).toBe("22");
  });

  test("switches the doubles winner without switching scores", () => {
    render(<MatchRecorder players={demoPlayers} />);

    const teamAButton = screen.getByRole("button", { name: "Mark Set 1 Team A as winner" });
    const teamBButton = screen.getByRole("button", { name: "Mark Set 1 Team B as winner" });
    fireEvent.click(teamBButton);

    expect((screen.getByLabelText("Set 1 Team A score") as HTMLInputElement).value).toBe("21");
    expect((screen.getByLabelText("Set 1 Team B score") as HTMLInputElement).value).toBe("18");
    expect(teamAButton.getAttribute("aria-pressed")).toBe("false");
    expect(teamBButton.getAttribute("aria-pressed")).toBe("true");
  });

  test("switches the singles winner without switching scores", () => {
    render(
      <MatchRecorder
        players={demoPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark Set 1 Team B as winner" }));

    expect((screen.getByLabelText("Set 1 Team A score") as HTMLInputElement).value).toBe("21");
    expect((screen.getByLabelText("Set 1 Team B score") as HTMLInputElement).value).toBe("18");
  });
});
