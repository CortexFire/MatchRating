// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { useNavigationSyncRegistration } from "./navigation-sync";
import { MobileShell } from "./mobile-shell";

const navigationMocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigationMocks }));
vi.mock("next/link", () => ({
  default: ({ children, href, onNavigate, ...props }: {
    children: ReactNode;
    href: string;
    onNavigate?: (event: { preventDefault: () => void }) => void;
  }) => (
    <a
      {...props}
      href={href}
      onClick={(event) => onNavigate?.({ preventDefault: () => event.preventDefault() })}
    >
      {children}
    </a>
  ),
}));

function RegisterSync({ sync }: { sync: () => Promise<void> }) {
  useNavigationSyncRegistration(sync);
  return null;
}

test("bottom navigation waits for draft synchronization", async () => {
  navigationMocks.push.mockReset();
  let resolveSync!: () => void;
  const sync = vi.fn(() => new Promise<void>((resolve) => {
    resolveSync = resolve;
  }));

  render(
    <MobileShell active="Record">
      <RegisterSync sync={sync} />
      <p>Recorder</p>
    </MobileShell>,
  );

  fireEvent.click(screen.getByRole("link", { name: "Home" }));
  expect(sync).toHaveBeenCalledOnce();
  expect(navigationMocks.push).not.toHaveBeenCalled();

  await act(async () => resolveSync());
  expect(navigationMocks.push).toHaveBeenCalledWith("/home");
});
