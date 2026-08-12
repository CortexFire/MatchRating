/* @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { InvitePanel } from "./invite-panel";

describe("InvitePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      share: vi.fn().mockResolvedValue(undefined),
    });
  });

  test("renders the invite URL, QR code, copy, and share controls", async () => {
    const { container } = render(
      <InvitePanel inviteUrl="https://matches.example.com/join/22222222-2222-4222-8222-222222222222" />,
    );

    expect((screen.getByLabelText("Invite URL") as HTMLInputElement).value).toBe(
      "matches.example.com/join/22222222-2222-4222-8222-222222222222",
    );
    expect(container.querySelector("svg")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "https://matches.example.com/join/22222222-2222-4222-8222-222222222222",
      );
      expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Share invite" }));

    await waitFor(() => {
      expect(navigator.share).toHaveBeenCalledWith({
        text: "Join my badminton rankings group: https://matches.example.com/join/22222222-2222-4222-8222-222222222222",
        url: "https://matches.example.com/join/22222222-2222-4222-8222-222222222222",
      });
    });
  });

  test("copies the canonical invite URL when Web Share is unavailable", async () => {
    Object.assign(navigator, { share: undefined });
    render(<InvitePanel inviteUrl="https://matches.example.com/join/22222222-2222-4222-8222-222222222222" />);

    fireEvent.click(screen.getByRole("button", { name: "Share invite" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "https://matches.example.com/join/22222222-2222-4222-8222-222222222222",
      );
      expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    });
  });
});
