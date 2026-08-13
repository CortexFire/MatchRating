// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GroupSwitcher } from "./group-switcher";

const navigationMocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigationMocks }));

describe("GroupSwitcher", () => {
  beforeEach(() => {
    navigationMocks.push.mockReset();
    vi.stubGlobal("confirm", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("asks before navigating to a different group", () => {
    const confirm = vi.mocked(window.confirm);
    confirm.mockReturnValue(true);

    render(
      <GroupSwitcher
        currentGroupId="downtown"
        groups={[{ id: "downtown", name: "Downtown Rec" }, { id: "wednesday", name: "Wednesday Club" }]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Current group Downtown Rec"), { target: { value: "wednesday" } });

    expect(confirm).toHaveBeenCalledWith("Switch groups? Your current match setup will be discarded.");
    expect(navigationMocks.push).toHaveBeenCalledWith("/groups/wednesday/matches/new");
  });

  test("keeps the current group selected when switching is canceled", () => {
    const confirm = vi.mocked(window.confirm);
    confirm.mockReturnValue(false);

    render(
      <GroupSwitcher
        currentGroupId="downtown"
        groups={[{ id: "downtown", name: "Downtown Rec" }, { id: "wednesday", name: "Wednesday Club" }]}
      />,
    );

    const select = screen.getByLabelText("Current group Downtown Rec") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "wednesday" } });

    expect(select.value).toBe("downtown");
    expect(navigationMocks.push).not.toHaveBeenCalled();
  });

  test("disables the selector when there is only one group", () => {
    const { container } = render(<GroupSwitcher currentGroupId="downtown" groups={[{ id: "downtown", name: "Downtown Rec" }]} />);

    expect((screen.getByLabelText("Current group Downtown Rec") as HTMLSelectElement).disabled).toBe(true);
    expect(container.querySelector("svg")).toBeNull();
  });

  test("disables switching when the recorder is locked", () => {
    render(
      <GroupSwitcher
        currentGroupId="downtown"
        groups={[{ id: "downtown", name: "Downtown Rec" }, { id: "wednesday", name: "Wednesday Club" }]}
        disabled
      />,
    );

    expect((screen.getByLabelText("Current group Downtown Rec") as HTMLSelectElement).disabled).toBe(true);
  });

  test("shows the dropdown indicator when another group is available", () => {
    const { container } = render(
      <GroupSwitcher
        currentGroupId="downtown"
        groups={[{ id: "downtown", name: "Downtown Rec" }, { id: "wednesday", name: "Wednesday Club" }]}
      />,
    );

    expect(container.querySelector("svg")).toBeTruthy();
  });
});
