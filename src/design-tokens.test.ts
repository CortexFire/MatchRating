import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("design token contract", () => {
  test("uses Inter globally instead of next/font or display fonts", () => {
    expect(read("src/app/layout.tsx")).not.toContain("next/font/google");
    expect(read("src/app/globals.css")).toContain(
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    );
    expect(read("src/app/globals.css")).not.toContain("Impact");
  });

  test("defines the design.md color tokens", () => {
    const globals = read("src/app/globals.css");

    [
      "--color-app-bg",
      "--color-surface",
      "--color-stroke",
      "--color-ink",
      "--color-muted",
      "--color-selection",
      "--color-selection-stroke",
      "--color-victory",
      "--color-victory-stroke",
      "--color-action",
    ].forEach((token) => {
      expect(globals).toContain(token);
    });
  });

  test("button primitive avoids rounded-full and off-palette danger styling", () => {
    const button = read("src/components/ui/button.tsx");

    expect(button).not.toContain("rounded-full");
    expect(button).not.toContain("danger");
  });

  test("legacy off-palette hex values are removed from app source", () => {
    const files = [
      "src/app/layout.tsx",
      "src/components/ui/button.tsx",
      "src/components/ui/card.tsx",
      "src/components/ui/input.tsx",
      "src/components/ui/badge.tsx",
      "src/components/ui/avatar.tsx",
      "src/components/app/mobile-shell.tsx",
      "src/components/app/player-row.tsx",
      "src/components/app/match-row.tsx",
      "src/components/app/screen-header.tsx",
      "src/components/match/match-recorder.tsx",
      "src/components/match/review-panel.tsx",
      "src/components/invite/invite-panel.tsx",
      "src/components/groups/create-group-form.tsx",
      "src/components/auth/login-form.tsx",
      "src/app/login/page.tsx",
      "src/app/profile/page.tsx",
      "src/app/groups/new/page.tsx",
      "src/app/groups/[groupId]/page.tsx",
      "src/app/groups/[groupId]/matches/[matchId]/page.tsx",
      "src/app/join/[token]/page.tsx",
    ];
    const forbidden = [
      "#145c43",
      "#0f4634",
      "#31564a",
      "#edf4f0",
      "#fff6f3",
      "#9f2d1f",
      "#ffece6",
      "#8aa096",
      "#dcefe5",
      "#1e7a55",
      "#a54332",
      "#fff7df",
      "#74510c",
      "#fff1ec",
      "#963021",
      "#48665d",
      "#202522",
      "#1f4f3a",
      "#31875B",
      "#76736e",
      "#777570",
      "#d9d9d9",
      "#ebe8df",
      "#234a3a",
      "#5f5d58",
      "#0d6a48",
      "#fffdf8",
    ];

    const source = files.map((file) => read(file)).join("\n");

    forbidden.forEach((hex) => {
      expect(source).not.toContain(hex);
    });
  });
});
