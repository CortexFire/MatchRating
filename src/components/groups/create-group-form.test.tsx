// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { CreateGroupForm } from "./create-group-form";

vi.mock("@/app/actions", () => ({ createGroup: vi.fn() }));

describe("CreateGroupForm", () => {
  test("starts with empty inputs that describe the expected club details", () => {
    render(<CreateGroupForm />);

    expect(screen.getByRole("textbox", { name: "Group name" }).getAttribute("placeholder")).toBe("Club Name");
    expect(screen.getByRole("textbox", { name: "Group name" }).getAttribute("value")).toBe("");
    expect(screen.getByRole("textbox", { name: "Description" }).getAttribute("placeholder")).toBe("Club description");
    expect(screen.getByRole("textbox", { name: "Description" }).getAttribute("value")).toBe("");
  });

  test("hides empty-field placeholder labels while the corresponding input is focused", () => {
    render(<CreateGroupForm />);

    const nameInput = screen.getByRole("textbox", { name: "Group name" });
    const descriptionInput = screen.getByRole("textbox", { name: "Description" });

    fireEvent.focus(nameInput);
    expect(nameInput.getAttribute("placeholder")).toBeNull();
    fireEvent.blur(nameInput);
    expect(nameInput.getAttribute("placeholder")).toBe("Club Name");

    fireEvent.focus(descriptionInput);
    expect(descriptionInput.getAttribute("placeholder")).toBeNull();
    fireEvent.blur(descriptionInput);
    expect(descriptionInput.getAttribute("placeholder")).toBe("Club description");
  });

  test("keeps placeholder labels absent after populated fields blur", () => {
    render(<CreateGroupForm />);

    const nameInput = screen.getByRole("textbox", { name: "Group name" });
    const descriptionInput = screen.getByRole("textbox", { name: "Description" });

    fireEvent.focus(nameInput);
    fireEvent.change(nameInput, { target: { value: "Sunday Badminton" } });
    fireEvent.blur(nameInput);
    expect(nameInput.getAttribute("placeholder")).toBeNull();

    fireEvent.focus(descriptionInput);
    fireEvent.change(descriptionInput, { target: { value: "Weekly social games" } });
    fireEvent.blur(descriptionInput);
    expect(descriptionInput.getAttribute("placeholder")).toBeNull();
  });

  test("keeps creation disabled until the group name contains non-whitespace text", () => {
    render(<CreateGroupForm />);

    const nameInput = screen.getByRole("textbox", { name: "Group name" });
    const createButton = screen.getByRole("button", { name: "Create group" });

    expect(createButton).toHaveProperty("disabled", true);

    fireEvent.change(nameInput, { target: { value: "   " } });
    expect(createButton).toHaveProperty("disabled", true);

    fireEvent.change(nameInput, { target: { value: "Sunday Badminton" } });
    expect(createButton).toHaveProperty("disabled", false);
  });

  test("does not show the post-creation invite notice", () => {
    render(<CreateGroupForm />);

    expect(screen.queryByText(/Recently played members can be invited/)).toBeNull();
  });
});
