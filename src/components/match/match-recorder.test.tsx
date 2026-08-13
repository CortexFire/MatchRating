// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { matchRecorderPlayers } from "./match-recorder.test-fixtures";
import { MobileShell } from "../app/mobile-shell";
import { type AppPlayer } from "@/lib/app-data";
import { MatchRecorder } from "./match-recorder";

const navigationMocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigationMocks }));

const editableDoublesMatch = {
  format: "doubles" as const,
  teamAUserIds: ["alice"],
  teamBUserIds: ["bea"],
  games: [{ teamAScore: 21, teamBScore: 18 }],
};

function openPlayerSelect(slotLabel = "Team B empty player slot 2") {
  render(<MatchRecorder players={matchRecorderPlayers} initialMatch={editableDoublesMatch} />);

  fireEvent.click(screen.getByLabelText(slotLabel));
}

function groupPlayer(id: string, name: string, initials: string): AppPlayer {
  return {
    id,
    name,
    initials,
    role: "Member",
    rating: 1500,
    rd: 350,
    rank: 0,
    gamesPlayed: 0,
    status: "Active",
    isGuest: false,
  };
}

describe("MatchRecorder", () => {
  afterEach(() => {
    navigationMocks.push.mockReset();
    navigationMocks.refresh.mockReset();
    navigationMocks.replace.mockReset();
    vi.useRealTimers();
  });
  test("offers the provided groups in a native group selector while recording", () => {
    render(
      <MatchRecorder
        groupId="wednesday"
        groupName="Wednesday Club Ladder"
        groupOptions={[
          { id: "downtown", name: "Downtown Rec" },
          { id: "wednesday", name: "Wednesday Club Ladder" },
        ]}
        players={matchRecorderPlayers}
        initialMatch={editableDoublesMatch}
      />,
    );

    const select = screen.getByRole("combobox", { name: "Current group Wednesday Club Ladder" }) as HTMLSelectElement;
    expect(select.value).toBe("wednesday");
    expect(screen.getByRole("option", { name: "Downtown Rec" })).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Team B empty player slot 2"));

    expect(screen.getByLabelText("Current group Wednesday Club Ladder")).toBeTruthy();
  });

  test("switches groups from Player Select through the clean target-group route", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <MatchRecorder
        groupId="wednesday"
        groupName="Wednesday Club Ladder"
        groupOptions={[
          { id: "downtown", name: "Downtown Rec" },
          { id: "wednesday", name: "Wednesday Club Ladder" },
        ]}
        players={matchRecorderPlayers}
        initialMatch={editableDoublesMatch}
      />,
    );

    fireEvent.click(screen.getByLabelText("Team B empty player slot 2"));

    const select = screen.getByRole("combobox", { name: "Current group Wednesday Club Ladder" }) as HTMLSelectElement;
    expect(select.value).toBe("wednesday");
    expect(screen.getByRole("option", { name: "Downtown Rec" })).toBeTruthy();

    fireEvent.change(select, { target: { value: "downtown" } });

    expect(confirm).toHaveBeenCalledWith("Switch groups? Your current match setup will be discarded.");
    expect(navigationMocks.push).toHaveBeenCalledWith("/groups/downtown/matches/new");
  });

  test("keyed target-group renders discard the previous group's player-select state", async () => {
    vi.useFakeTimers();
    const groupAPlayers = [
      groupPlayer("group-a-ada", "AveryAda", "AA"),
      groupPlayer("group-a-bea", "AveryBea", "AB"),
      groupPlayer("group-a-cara", "AveryCara", "AC"),
    ];
    const groupBPlayers = [
      groupPlayer("group-b-ada", "BriaAda", "BA"),
      groupPlayer("group-b-bea", "BriaBea", "BB"),
      groupPlayer("group-b-cara", "BriaCara", "BC"),
    ];
    const createGuestPlayers = vi.fn(async ({ groupId, names }: { groupId: string; names: string[] }) => ({
      ok: true as const,
      data: {
        players: names.map((name, index) => ({
          ...groupPlayer(`${groupId}-guest-${index}`, name, "GG"),
          role: "Guest" as const,
          isGuest: true,
        })),
      },
    }));
    const saveActiveMatchDraft = vi.fn(async () => ({ ok: true as const, data: { draftId: "saved-draft" } }));
    const submitMatchAction = vi.fn(async () => ({ ok: false as const, message: "Group A-only submission message" }));
    const groupOptions = [
      { id: "group-a", name: "Group A" },
      { id: "group-b", name: "Group B" },
    ];
    const { rerender } = render(
      <MatchRecorder
        key="group-a"
        groupId="group-a"
        groupName="Group A"
        groupOptions={groupOptions}
        players={groupAPlayers}
        initialMatch={{
          format: "doubles",
          teamAUserIds: ["group-a-ada"],
          teamBUserIds: ["group-a-bea"],
          games: [{ teamAScore: 14, teamBScore: 12 }],
        }}
        draftId="draft-a"
        createGuestPlayers={createGuestPlayers}
        saveActiveMatchDraft={saveActiveMatchDraft}
        submitMatchAction={submitMatchAction}
      />,
    );

    fireEvent.click(screen.getByLabelText("Team A empty player slot 2"));
    expect(screen.getByRole("combobox", { name: "Current group Group A" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Add a guest or search for a player"), { target: { value: "Group A Guest" } });
    fireEvent.click(screen.getByRole("button", { name: "Add guest player Group A Guest" }));
    fireEvent.click(screen.getByRole("button", { name: /Select Team B/ }));
    fireEvent.change(screen.getByLabelText("Add a guest or search for a player"), { target: { value: "AveryCara" } });
    fireEvent.click(screen.getByRole("button", { name: "Select AveryCara" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add players" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    });
    expect(screen.getByText("Group A-only submission message")).toBeTruthy();

    rerender(
      <MatchRecorder
        key="group-b"
        groupId="group-b"
        groupName="Group B"
        groupOptions={groupOptions}
        players={groupBPlayers}
        initialMatch={{
          format: "doubles",
          teamAUserIds: ["group-b-ada"],
          teamBUserIds: ["group-b-bea"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
        draftId="draft-b"
        createGuestPlayers={createGuestPlayers}
        saveActiveMatchDraft={saveActiveMatchDraft}
        submitMatchAction={submitMatchAction}
      />,
    );

    expect(screen.getByText("BriaAda")).toBeTruthy();
    expect(screen.getByText("BriaBea")).toBeTruthy();
    expect(screen.queryByText("AveryAda")).toBeNull();
    expect(screen.queryByText("Group A Guest")).toBeNull();
    expect(screen.queryByText("Group A-only submission message")).toBeNull();
    expect((screen.getByLabelText("Set 1 Team A score") as HTMLInputElement).value).toBe("21");
    expect((screen.getByLabelText("Set 1 Team B score") as HTMLInputElement).value).toBe("18");

    fireEvent.click(screen.getByLabelText("Team B empty player slot 2"));
    expect((screen.getByLabelText("Add a guest or search for a player") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Filter All" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Select AveryCara" })).toBeNull();
    expect(screen.getByRole("button", { name: "Select BriaCara" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Add a guest or search for a player"), { target: { value: "Group B Guest" } });
    fireEvent.click(screen.getByRole("button", { name: "Add guest player Group B Guest" }));
    fireEvent.click(screen.getByRole("button", { name: /Select Team A/ }));
    fireEvent.change(screen.getByLabelText("Add a guest or search for a player"), { target: { value: "BriaCara" } });
    fireEvent.click(screen.getByRole("button", { name: "Select BriaCara" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add players" }));
    });

    expect(createGuestPlayers).toHaveBeenLastCalledWith({ groupId: "group-b", names: ["Group B Guest"] });

    fireEvent.change(screen.getByLabelText("Set 1 Team B score"), { target: { value: "20" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });
    expect(saveActiveMatchDraft).toHaveBeenLastCalledWith({
      groupId: "group-b",
      draftId: "draft-b",
      format: "doubles",
      teamAUserIds: ["group-b-ada", "group-b-cara"],
      teamBUserIds: ["group-b-bea", "group-b-guest-0"],
      games: [{ teamAScore: 21, teamBScore: 20, winnerTeam: "A" }],
    });
  });
  test("renders a disputed match as the initial recording state", () => {
    render(
      <MatchRecorder
        players={matchRecorderPlayers}
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

  test("prompts users to add a guest or search for a player", () => {
    openPlayerSelect();

    const search = screen.getByRole("searchbox", { name: "Add a guest or search for a player" });

    expect(search.getAttribute("placeholder")).toBe("Add a guest or search for a player");
    expect(screen.queryByRole("searchbox", { name: "Search for a player" })).toBeNull();
  });

  test("shows 5.2 compact player cards in a keyboard-focusable scroll region", () => {
    openPlayerSelect();

    const roster = screen.getByRole("region", { name: "Available players" });
    const player = screen.getByRole("button", { name: "Select Cory Shah" });
    const avatar = screen.getByText("CS");
    const name = screen.getByText("Cory Shah");
    const statusDot = player.querySelector('[aria-hidden="true"]');

    expect(roster.classList.contains("max-h-[352px]")).toBe(true);
    expect(roster.classList.contains("gap-2")).toBe(true);
    expect(roster.classList.contains("overflow-y-auto")).toBe(true);
    expect(roster.classList.contains("focus-visible:outline-action")).toBe(true);
    expect(roster.getAttribute("tabindex")).toBe("0");
    expect(player.classList.contains("h-[60px]")).toBe(true);
    expect(player.classList.contains("shrink-0")).toBe(true);
    expect(avatar.classList.contains("size-10")).toBe(true);
    expect(name.classList.contains("text-sm")).toBe(true);
    expect(name.classList.contains("truncate")).toBe(true);
    expect(statusDot?.classList.contains("size-2")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Filter Selected" }));

    expect(screen.getByRole("region", { name: "Available players" }).hasAttribute("tabindex")).toBe(false);
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
        players={matchRecorderPlayers}
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

    const search = screen.getByLabelText("Add a guest or search for a player");

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
        players={matchRecorderPlayers}
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

    expect(screen.getAllByText("Inactive").length).toBeGreaterThan(0);
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

  test("creates a draft guest from the search box on the active team", () => {
    openPlayerSelect();

    fireEvent.change(screen.getByLabelText("Add a guest or search for a player"), { target: { value: "Noah Kim" } });
    fireEvent.click(screen.getByRole("button", { name: "Add guest player Noah Kim" }));

    expect(screen.getByLabelText("Draft Team B player Noah Kim")).toBeTruthy();
    expect(screen.getByLabelText("Remove Noah Kim from draft Team B")).toBeTruthy();
  });

  test("enables guest add only for a non-empty search and open active-team slot", () => {
    openPlayerSelect();

    const addGuest = screen.getByRole("button", { name: "Add player" }) as HTMLButtonElement;
    expect(addGuest.disabled).toBe(true);
    expect(addGuest.classList.contains("bg-surface")).toBe(true);
    expect(addGuest.classList.contains("text-muted")).toBe(true);

    fireEvent.change(screen.getByLabelText("Add a guest or search for a player"), { target: { value: "Noah Kim" } });
    const enabledAddGuest = screen.getByRole("button", {
      name: "Add guest player Noah Kim",
    }) as HTMLButtonElement;
    expect(enabledAddGuest.disabled).toBe(false);
    expect(enabledAddGuest.classList.contains("bg-action")).toBe(true);
    expect(enabledAddGuest.classList.contains("text-white")).toBe(true);

    fireEvent.change(screen.getByLabelText("Add a guest or search for a player"), { target: { value: "Dev" } });
    fireEvent.click(screen.getByRole("button", { name: "Select Dev Okafor" }));
    fireEvent.change(screen.getByLabelText("Add a guest or search for a player"), { target: { value: "Noah Kim" } });

    const fullTeamAddGuest = screen.getByRole("button", { name: "Add player" }) as HTMLButtonElement;
    expect(fullTeamAddGuest.disabled).toBe(true);
    expect(fullTeamAddGuest.classList.contains("bg-surface")).toBe(true);
    expect(fullTeamAddGuest.classList.contains("text-muted")).toBe(true);
  });

  test("discards draft guests when Player Select is canceled", () => {
    openPlayerSelect();

    fireEvent.change(screen.getByLabelText("Add a guest or search for a player"), { target: { value: "Noah Kim" } });
    fireEvent.click(screen.getByRole("button", { name: "Add guest player Noah Kim" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("heading", { name: "Match Recording" })).toBeTruthy();
    expect(screen.queryByText("Noah")).toBeNull();
  });

  test("persists only selected draft guests when Add players is clicked", async () => {
    const createGuestPlayers = vi.fn(async () => ({
      ok: true as const,
      data: {
        players: [
          {
            id: "guest-mina",
            name: "Mina Ray",
            initials: "MR",
            role: "Guest" as const,
            rating: 1500,
            rd: 350,
            rank: 0,
            gamesPlayed: 0,
            status: "Active" as const,
            isGuest: true,
          },
        ],
      },
    }));

    render(
      <MatchRecorder
        players={matchRecorderPlayers}
        initialMatch={editableDoublesMatch}
        createGuestPlayers={createGuestPlayers}
      />,
    );

    fireEvent.click(screen.getByLabelText("Team B empty player slot 2"));
    fireEvent.change(screen.getByLabelText("Add a guest or search for a player"), { target: { value: "Noah Kim" } });
    fireEvent.click(screen.getByRole("button", { name: "Add guest player Noah Kim" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Noah Kim from draft Team B" }));
    fireEvent.change(screen.getByLabelText("Add a guest or search for a player"), { target: { value: "Mina Ray" } });
    fireEvent.click(screen.getByRole("button", { name: "Add guest player Mina Ray" }));
    fireEvent.click(screen.getByRole("button", { name: /Select Team A/ }));
    fireEvent.change(screen.getByLabelText("Add a guest or search for a player"), { target: { value: "Dev" } });
    fireEvent.click(screen.getByRole("button", { name: "Select Dev Okafor" }));
    fireEvent.click(screen.getByRole("button", { name: "Add players" }));

    await waitFor(() => {
      expect(createGuestPlayers).toHaveBeenCalledWith({
        groupId: "test-group",
        names: ["Mina Ray"],
      });
      expect(screen.getByRole("heading", { name: "Match Recording" })).toBeTruthy();
    });
    expect(screen.getByText("Mina")).toBeTruthy();
    expect(screen.queryByText("Noah")).toBeNull();
  });

  test("enables Add players after the first draft selection and disables it when none remain", () => {
    render(
      <MatchRecorder
        players={matchRecorderPlayers}
        initialMatch={{
          format: "doubles",
          teamAUserIds: [],
          teamBUserIds: [],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
      />,
    );
    fireEvent.click(screen.getByLabelText("Team A empty player slot 1"));

    const addPlayers = screen.getByRole("button", { name: "Add players" }) as HTMLButtonElement;
    expect(addPlayers.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Select Dev Okafor" }));
    expect(addPlayers.disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Remove Dev Okafor from draft Team A" }));
    expect(addPlayers.disabled).toBe(true);
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
        <MatchRecorder players={matchRecorderPlayers} initialMatch={editableDoublesMatch} />
      </MobileShell>,
    );

    fireEvent.click(screen.getByLabelText("Team B empty player slot 2"));

    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Record" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Groups" })).toBeTruthy();
  });

  test("starts a fresh match with blank score placeholders and Team A selected", () => {
    render(<MatchRecorder players={matchRecorderPlayers} />);

    const teamAScore = screen.getByLabelText("Set 1 Team A score") as HTMLInputElement;
    const teamBScore = screen.getByLabelText("Set 1 Team B score") as HTMLInputElement;

    expect(teamAScore.value).toBe("");
    expect(teamBScore.value).toBe("");
    expect(teamAScore.placeholder).toBe("-");
    expect(teamBScore.placeholder).toBe("-");
    expect(screen.getByRole("button", { name: "Mark Set 1 Team A as winner" }).getAttribute("aria-pressed")).toBe("true");
  });

  test("adds a blank set with Team A selected", () => {
    render(<MatchRecorder players={matchRecorderPlayers} />);

    fireEvent.click(screen.getByRole("button", { name: "Add set" }));

    expect((screen.getByLabelText("Set 2 Team A score") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Set 2 Team B score") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Mark Set 2 Team A as winner" }).getAttribute("aria-pressed")).toBe("true");
  });

  test("shows set removal controls only for editable matches with multiple sets", () => {
    const initialMatch = {
      format: "singles" as const,
      teamAUserIds: ["alice"],
      teamBUserIds: ["bea"],
      games: [
        { teamAScore: 21, teamBScore: 18 },
        { teamAScore: 18, teamBScore: 21 },
      ],
    };
    const { unmount } = render(
      <MatchRecorder players={matchRecorderPlayers} initialMatch={initialMatch} />,
    );

    expect(screen.getByRole("button", { name: "Remove Set 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Set 2" })).toBeTruthy();

    unmount();
    render(<MatchRecorder canEdit={false} players={matchRecorderPlayers} initialMatch={initialMatch} />);
    expect(screen.queryByRole("button", { name: /Remove Set/ })).toBeNull();
  });

  test("removes and renumbers sets while hiding removal for the final set", () => {
    render(
      <MatchRecorder
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [
            { teamAScore: 21, teamBScore: 18 },
            { teamAScore: 18, teamBScore: 21 },
            { teamAScore: 15, teamBScore: 21 },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Set 2" }));

    expect(screen.queryByRole("heading", { name: "Set 3" })).toBeNull();
    expect((screen.getByLabelText("Set 2 Team A score") as HTMLInputElement).value).toBe("15");
    expect((screen.getByLabelText("Set 2 Team B score") as HTMLInputElement).value).toBe("21");

    fireEvent.click(screen.getByRole("button", { name: "Remove Set 2" }));

    expect(screen.queryByRole("button", { name: /Remove Set/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "Set 1" })).toBeTruthy();
  });

  test("autosaves the shortened set list after removal", async () => {
    vi.useFakeTimers();
    const saveActiveMatchDraft = vi.fn(async () => ({
      ok: true as const,
      data: { draftId: "draft-1" },
    }));

    render(
      <MatchRecorder
        groupId="11111111-1111-4111-8111-111111111111"
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [
            { teamAScore: 21, teamBScore: 18 },
            { teamAScore: 18, teamBScore: 21 },
          ],
        }}
        saveActiveMatchDraft={saveActiveMatchDraft}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Set 1" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });

    expect(saveActiveMatchDraft).toHaveBeenCalledWith({
      groupId: "11111111-1111-4111-8111-111111111111",
      draftId: undefined,
      format: "singles",
      teamAUserIds: ["alice"],
      teamBUserIds: ["bea"],
      games: [{ teamAScore: 18, teamBScore: 21, winnerTeam: "B" }],
    });
  });

  test("allows scores to be changed with number inputs", () => {
    render(<MatchRecorder players={matchRecorderPlayers} />);

    const teamBScore = screen.getByLabelText("Set 1 Team B score") as HTMLInputElement;
    fireEvent.change(teamBScore, { target: { value: "22" } });

    expect(teamBScore.value).toBe("22");
  });

  test("switches the doubles winner without switching scores", () => {
    render(<MatchRecorder players={matchRecorderPlayers} />);

    const teamAButton = screen.getByRole("button", { name: "Mark Set 1 Team A as winner" });
    const teamBButton = screen.getByRole("button", { name: "Mark Set 1 Team B as winner" });
    const teamBTile = screen.getByLabelText("Set 1 Team B not entered Loss");
    const teamBScore = screen.getByLabelText("Set 1 Team B score");

    expect(teamBButton.parentElement).toBe(teamBTile);
    fireEvent.click(teamBScore);
    fireEvent.focus(teamBScore);
    expect(teamAButton.getAttribute("aria-pressed")).toBe("true");
    expect(teamBButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(teamBButton);

    expect((screen.getByLabelText("Set 1 Team A score") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Set 1 Team B score") as HTMLInputElement).value).toBe("");
    expect(teamAButton.getAttribute("aria-pressed")).toBe("false");
    expect(teamBButton.getAttribute("aria-pressed")).toBe("true");
  });

  test("switches the singles winner without switching scores", () => {
    render(
      <MatchRecorder
        players={matchRecorderPlayers}
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

  test("preserves an explicit initial winner that conflicts with the scores", () => {
    render(
      <MatchRecorder
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "B" }],
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Mark Set 1 Team B as winner" }).getAttribute("aria-pressed")).toBe("true");
  });

  test("uses Team A for a legacy tied-score initial recording without a selected winner", () => {
    render(
      <MatchRecorder
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 12, teamBScore: 12 }],
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Mark Set 1 Team A as winner" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Mark Set 1 Team B as winner" }).getAttribute("aria-pressed")).toBe("false");
  });

  test("retains a conflicting selected winner in autosave and submit payloads", async () => {
    vi.useFakeTimers();
    const saveActiveMatchDraft = vi.fn(async () => ({ ok: true as const, data: { draftId: "draft-1" } }));
    const submitMatchAction = vi.fn(async () => ({
      ok: true as const,
      data: { matchId: "match-1", revisionId: "revision-1", ratingJobId: "job-1", ratingStatus: "queued" as const },
    }));

    render(
      <MatchRecorder
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "B" }],
        }}
        saveActiveMatchDraft={saveActiveMatchDraft}
        submitMatchAction={submitMatchAction}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(saveActiveMatchDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "B" }],
    }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
      await Promise.resolve();
    });
    expect(submitMatchAction).toHaveBeenCalledTimes(1);
    expect(submitMatchAction).toHaveBeenLastCalledWith(expect.objectContaining({
      games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "B" }],
    }));
  });

  test("re-derives unequal score edits while retaining a selected winner for tied scores", () => {
    render(
      <MatchRecorder
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "B" }],
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Set 1 Team B score"), { target: { value: "20" } });
    expect(screen.getByRole("button", { name: "Mark Set 1 Team A as winner" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Mark Set 1 Team B as winner" }));
    fireEvent.change(screen.getByLabelText("Set 1 Team B score"), { target: { value: "21" } });
    expect(screen.getByRole("button", { name: "Mark Set 1 Team B as winner" }).getAttribute("aria-pressed")).toBe("true");
  });

  test("derives the winner after both blank scores are entered", () => {
    render(<MatchRecorder players={matchRecorderPlayers} />);

    const teamAButton = screen.getByRole("button", { name: "Mark Set 1 Team A as winner" });
    const teamBButton = screen.getByRole("button", { name: "Mark Set 1 Team B as winner" });

    fireEvent.change(screen.getByLabelText("Set 1 Team A score"), { target: { value: "18" } });
    expect(teamAButton.getAttribute("aria-pressed")).toBe("true");
    expect(teamBButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.change(screen.getByLabelText("Set 1 Team B score"), { target: { value: "21" } });
    expect(teamAButton.getAttribute("aria-pressed")).toBe("false");
    expect(teamBButton.getAttribute("aria-pressed")).toBe("true");
  });

  test("autosaves a complete draft after scores change", async () => {
    vi.useFakeTimers();
    const saveActiveMatchDraft = vi.fn(async () => ({
      ok: true as const,
      data: { draftId: "draft-1" },
    }));

    render(
      <MatchRecorder
        groupId="11111111-1111-4111-8111-111111111111"
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
        saveActiveMatchDraft={saveActiveMatchDraft}
      />,
    );

    fireEvent.change(screen.getByLabelText("Set 1 Team B score"), { target: { value: "20" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });

    expect(saveActiveMatchDraft).toHaveBeenLastCalledWith({
      groupId: "11111111-1111-4111-8111-111111111111",
      draftId: undefined,
      format: "singles",
      teamAUserIds: ["alice"],
      teamBUserIds: ["bea"],
      games: [{ teamAScore: 21, teamBScore: 20, winnerTeam: "A" }],
    });
  });

  test("serializes overlapping autosaves and reuses the first save's draft id", async () => {
    vi.useFakeTimers();
    let resolveFirstSave!: (result: { ok: true; data: { draftId: string } }) => void;
    const saveActiveMatchDraft = vi.fn()
      .mockImplementationOnce(() => new Promise<{ ok: true; data: { draftId: string } }>((resolve) => {
        resolveFirstSave = resolve;
      }))
      .mockResolvedValue({ ok: true as const, data: { draftId: "draft-created" } });

    render(
      <MatchRecorder
        groupId="11111111-1111-4111-8111-111111111111"
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
        saveActiveMatchDraft={saveActiveMatchDraft}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    fireEvent.change(screen.getByLabelText("Set 1 Team B score"), { target: { value: "19" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(saveActiveMatchDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstSave({ ok: true, data: { draftId: "draft-created" } });
      await Promise.resolve();
    });

    expect(saveActiveMatchDraft).toHaveBeenCalledTimes(2);
    expect(saveActiveMatchDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      draftId: "draft-created",
      games: [{ teamAScore: 21, teamBScore: 19, winnerTeam: "A" }],
    }));
  });

  test("pauses autosave until every score is entered", async () => {
    vi.useFakeTimers();
    const saveActiveMatchDraft = vi.fn(async () => ({
      ok: true as const,
      data: { draftId: "draft-1" },
    }));

    render(
      <MatchRecorder
        groupId="11111111-1111-4111-8111-111111111111"
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
        saveActiveMatchDraft={saveActiveMatchDraft}
      />,
    );

    fireEvent.change(screen.getByLabelText("Set 1 Team B score"), { target: { value: "" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });
    expect(saveActiveMatchDraft).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Set 1 Team B score"), { target: { value: "20" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });
    expect(saveActiveMatchDraft).toHaveBeenCalledWith({
      groupId: "11111111-1111-4111-8111-111111111111",
      draftId: undefined,
      format: "singles",
      teamAUserIds: ["alice"],
      teamBUserIds: ["bea"],
      games: [{ teamAScore: 21, teamBScore: 20, winnerTeam: "A" }],
    });
  });

  test("keeps Submit disabled until a singles roster and every visible set are valid", () => {
    const submitMatchAction = vi.fn(async () => ({
      ok: true as const,
      data: {
        matchId: "match-1",
        revisionId: "revision-1",
        ratingJobId: "job-1",
        ratingStatus: "queued" as const,
      },
    }));

    render(
      <MatchRecorder
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
        submitMatchAction={submitMatchAction}
      />,
    );

    const submit = screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);

    fireEvent.change(screen.getByLabelText("Set 1 Team B score"), { target: { value: "" } });
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Set 1 Team B score"), { target: { value: "21" } });
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Set 1 Team B score"), { target: { value: "19" } });
    expect(submit.disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Add set" }));
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Set 2 Team A score"), { target: { value: "15" } });
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Set 2 Team B score"), { target: { value: "13" } });
    expect(submit.disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Remove Set 2" }));
    expect(submit.disabled).toBe(false);

    fireEvent.change(screen.getByLabelText("Set 1 Team B score"), { target: { value: "" } });
    fireEvent.click(submit);

    expect(submitMatchAction).not.toHaveBeenCalled();
  });

  test("keeps Submit disabled until every doubles player slot is filled", () => {
    render(
      <MatchRecorder
        players={matchRecorderPlayers}
        initialMatch={{
          format: "doubles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
      />,
    );

    expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("Team A empty player slot 2"));
    fireEvent.click(screen.getByRole("button", { name: "Select Dev Okafor" }));
    fireEvent.click(screen.getByRole("button", { name: "Add players" }));
    expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("Team B empty player slot 2"));
    fireEvent.click(screen.getByRole("button", { name: "Select Henry Park" }));
    fireEvent.click(screen.getByRole("button", { name: "Add players" }));
    expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled).toBe(false);
  });

  test("keeps Submit disabled when a player appears on both teams", () => {
    render(
      <MatchRecorder
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["alice"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
      />,
    );

    expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("disables Submit while a valid match is being submitted", async () => {
    let resolveSubmission!: (result: {
      ok: true;
      data: {
        matchId: string;
        revisionId: string;
        ratingJobId: string;
        ratingStatus: "queued";
      };
    }) => void;
    const submitMatchAction = vi.fn(
      () =>
        new Promise<{
          ok: true;
          data: {
            matchId: string;
            revisionId: string;
            ratingJobId: string;
            ratingStatus: "queued";
          };
        }>((resolve) => {
          resolveSubmission = resolve;
        }),
    );

    render(
      <MatchRecorder
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
        submitMatchAction={submitMatchAction}
      />,
    );

    const submit = screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement;
    fireEvent.click(submit);

    await waitFor(() => expect(submit.disabled).toBe(true));

    await act(async () => {
      resolveSubmission({
        ok: true,
        data: {
          matchId: "match-1",
          revisionId: "revision-1",
          ratingJobId: "job-1",
          ratingStatus: "queued",
        },
      });
    });
  });

  test("keeps the submitted match visible and locked for three seconds", async () => {
    vi.useFakeTimers();
    const submitMatchAction = vi.fn(async () => ({
      ok: true as const,
      data: {
        matchId: "match-1",
        revisionId: "revision-1",
        ratingJobId: "job-1",
        ratingStatus: "queued" as const,
      },
    }));

    render(
      <MatchRecorder
        groupId="11111111-1111-4111-8111-111111111111"
        groupOptions={[
          { id: "11111111-1111-4111-8111-111111111111", name: "Downtown Rec" },
          { id: "22222222-2222-4222-8222-222222222222", name: "Wednesday Club" },
        ]}
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
        submitMatchAction={submitMatchAction}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    });

    expect(screen.getByText("Match saved. Ratings updated immediately. Opponents may review it, and participants have 30 days to correct it.")).toBeTruthy();
    expect((screen.getByLabelText("Current group Downtown Rec") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "singles" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Set 1 Team A score") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Mark Set 1 Team A as winner" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText("Remove Alice from Team A")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add set" })).toBeNull();
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_999);
    });

    expect(screen.getByText("Match saved. Ratings updated immediately. Opponents may review it, and participants have 30 days to correct it.")).toBeTruthy();
    expect((screen.getByLabelText("Set 1 Team A score") as HTMLInputElement).value).toBe("21");
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  test("resets the recorder and submission identity after three seconds", async () => {
    vi.useFakeTimers();
    const submitMatchAction = vi.fn().mockResolvedValue({
      ok: true as const,
      data: {
        matchId: "match-1",
        revisionId: "revision-1",
        ratingJobId: "job-1",
        ratingStatus: "queued" as const,
      },
    });

    render(
      <MatchRecorder
        groupId="11111111-1111-4111-8111-111111111111"
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
        draftId="33333333-3333-4333-8333-333333333333"
        submitMatchAction={submitMatchAction}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    });
    const firstCommandId = submitMatchAction.mock.calls[0][0].commandId;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(screen.queryByText("Match saved. Ratings updated immediately. Opponents may review it, and participants have 30 days to correct it.")).toBeNull();
    expect(screen.getByRole("button", { name: "doubles" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Team A empty player slot 1")).toBeTruthy();
    expect(screen.getByLabelText("Team A empty player slot 2")).toBeTruthy();
    expect(screen.getByLabelText("Team B empty player slot 1")).toBeTruthy();
    expect(screen.getByLabelText("Team B empty player slot 2")).toBeTruthy();
    expect((screen.getByLabelText("Set 1 Team A score") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Set 1 Team B score") as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled).toBe(true);
    expect(navigationMocks.replace).toHaveBeenCalledWith(
      "/groups/11111111-1111-4111-8111-111111111111/matches/new",
      { scroll: false },
    );

    fireEvent.click(screen.getByRole("button", { name: "singles" }));
    fireEvent.click(screen.getByLabelText("Team A empty player slot 1"));
    fireEvent.click(screen.getByRole("button", { name: "Select Alice Tan" }));
    fireEvent.click(screen.getByRole("button", { name: "Add players" }));
    fireEvent.click(screen.getByLabelText("Team B empty player slot 1"));
    fireEvent.click(screen.getByRole("button", { name: "Select Bea Rivera" }));
    fireEvent.click(screen.getByRole("button", { name: "Add players" }));
    fireEvent.change(screen.getByLabelText("Set 1 Team A score"), { target: { value: "21" } });
    fireEvent.change(screen.getByLabelText("Set 1 Team B score"), { target: { value: "19" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    });

    expect(submitMatchAction).toHaveBeenCalledTimes(2);
    expect(submitMatchAction.mock.calls[1][0].draftId).toBeUndefined();
    expect(submitMatchAction.mock.calls[1][0].commandId).not.toBe(firstCommandId);
  });

  test("cancels the scheduled recorder reset when unmounted", async () => {
    vi.useFakeTimers();
    const clearTimeout = vi.spyOn(window, "clearTimeout");
    const submitMatchAction = vi.fn(async () => ({
      ok: true as const,
      data: {
        matchId: "match-1",
        revisionId: "revision-1",
        ratingJobId: "job-1",
        ratingStatus: "queued" as const,
      },
    }));
    const { unmount } = render(
      <MatchRecorder
        groupId="11111111-1111-4111-8111-111111111111"
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
        submitMatchAction={submitMatchAction}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    });
    unmount();

    expect(clearTimeout).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_000);

    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  test("cancels a scheduled autosave when submitting immediately", async () => {
    vi.useFakeTimers();
    const saveActiveMatchDraft = vi.fn(async () => ({
      ok: true as const,
      data: { draftId: "draft-1" },
    }));
    const submitMatchAction = vi.fn(async () => ({
      ok: true as const,
      data: {
        matchId: "match-1",
        revisionId: "revision-1",
        ratingJobId: "job-1",
        ratingStatus: "queued" as const,
      },
    }));

    render(
      <MatchRecorder
        groupId="11111111-1111-4111-8111-111111111111"
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
        draftId="draft-1"
        saveActiveMatchDraft={saveActiveMatchDraft}
        submitMatchAction={submitMatchAction}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });

    expect(submitMatchAction).toHaveBeenCalledWith(expect.objectContaining({ draftId: "draft-1" }));
    expect(saveActiveMatchDraft).not.toHaveBeenCalled();
    expect(screen.getByText("Match saved. Ratings updated immediately. Opponents may review it, and participants have 30 days to correct it.")).toBeTruthy();
  });

  test("waits for an in-flight autosave before submitting its returned draft id", async () => {
    vi.useFakeTimers();
    let resolveSave!: (result: { ok: true; data: { draftId: string } }) => void;
    const saveActiveMatchDraft = vi.fn(() => new Promise<{ ok: true; data: { draftId: string } }>((resolve) => {
      resolveSave = resolve;
    }));
    const submitMatchAction = vi.fn(async () => ({
      ok: true as const,
      data: {
        matchId: "match-1",
        revisionId: "revision-1",
        ratingJobId: "job-1",
        ratingStatus: "queued" as const,
      },
    }));

    render(
      <MatchRecorder
        groupId="11111111-1111-4111-8111-111111111111"
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        }}
        saveActiveMatchDraft={saveActiveMatchDraft}
        submitMatchAction={submitMatchAction}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(saveActiveMatchDraft).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await act(async () => {});
    expect(submitMatchAction).not.toHaveBeenCalled();

    await act(async () => {
      resolveSave({ ok: true, data: { draftId: "draft-created" } });
      await Promise.resolve();
    });

    expect(submitMatchAction).toHaveBeenCalledWith(expect.objectContaining({ draftId: "draft-created" }));
    expect(screen.getByText("Match saved. Ratings updated immediately. Opponents may review it, and participants have 30 days to correct it.")).toBeTruthy();
  });

  test("does not restart autosave when a server refresh replaces the action reference", async () => {
    vi.useFakeTimers();
    const firstSave = vi.fn().mockResolvedValue({
      ok: true as const,
      data: { draftId: "draft-1" },
    });
    const replacementSave = vi.fn().mockResolvedValue({
      ok: true as const,
      data: { draftId: "draft-1" },
    });
    const initialMatch = {
      format: "singles" as const,
      teamAUserIds: ["alice"],
      teamBUserIds: ["bea"],
      games: [{ teamAScore: 21, teamBScore: 18 }],
    };

    const { rerender } = render(
      <MatchRecorder
        players={matchRecorderPlayers}
        initialMatch={initialMatch}
        saveActiveMatchDraft={firstSave}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });
    expect(firstSave).toHaveBeenCalledTimes(1);

    rerender(
      <MatchRecorder
        players={matchRecorderPlayers}
        initialMatch={initialMatch}
        saveActiveMatchDraft={replacementSave}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });

    expect(replacementSave).not.toHaveBeenCalled();
  });

  test("preserves one client command ID across a submission retry", async () => {
    const submitMatchAction = vi.fn()
      .mockResolvedValueOnce({ ok: false as const, message: "Temporary network failure" })
      .mockResolvedValueOnce({
        ok: true as const,
        data: { matchId: "match-1", revisionId: "revision-1", ratingJobId: "job-1", ratingStatus: "queued" as const },
      });

    render(
      <MatchRecorder
        players={matchRecorderPlayers}
        initialMatch={{ format: "singles", teamAUserIds: ["alice"], teamBUserIds: ["bea"], games: [{ teamAScore: 21, teamBScore: 18 }] }}
        submitMatchAction={submitMatchAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await screen.findByText("Temporary network failure");
    const firstCommandId = submitMatchAction.mock.calls[0][0].commandId;

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(submitMatchAction).toHaveBeenCalledTimes(2));
    expect(submitMatchAction.mock.calls[1][0].commandId).toBe(firstCommandId);
    expect(screen.getByText("Match saved. Ratings updated immediately. Opponents may review it, and participants have 30 days to correct it.")).toBeTruthy();
  });

  test("renders selected-player drafts as read-only", () => {
    render(
      <MatchRecorder
        canEdit={false}
        players={matchRecorderPlayers}
        initialMatch={{
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 12, teamBScore: 12 }],
        }}
      />,
    );

    expect((screen.getByLabelText("Set 1 Team A score") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(screen.queryByLabelText("Remove Alice from Team A")).toBeNull();
  });
});
