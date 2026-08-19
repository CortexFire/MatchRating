// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import {
  NavigationSyncProvider,
  SyncAwareLink,
  useNavigationSyncRegistration,
} from "./navigation-sync";

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

describe("navigation synchronization", () => {
  test("waits for the registered sync before navigating", async () => {
    navigationMocks.push.mockReset();
    let resolveSync!: () => void;
    const sync = vi.fn(() => new Promise<void>((resolve) => {
      resolveSync = resolve;
    }));

    render(
      <NavigationSyncProvider>
        <RegisterSync sync={sync} />
        <SyncAwareLink href="/home">Home</SyncAwareLink>
      </NavigationSyncProvider>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    expect(sync).toHaveBeenCalledOnce();
    expect(navigationMocks.push).not.toHaveBeenCalled();

    await act(async () => resolveSync());
    expect(navigationMocks.push).toHaveBeenCalledWith("/home");
  });

  test("continues navigation when the registered sync rejects", async () => {
    navigationMocks.push.mockReset();
    const sync = vi.fn(async () => {
      throw new Error("offline");
    });

    render(
      <NavigationSyncProvider>
        <RegisterSync sync={sync} />
        <SyncAwareLink href="/groups">Groups</SyncAwareLink>
      </NavigationSyncProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Groups" }));
    });

    expect(navigationMocks.push).toHaveBeenCalledWith("/groups");
  });
});
