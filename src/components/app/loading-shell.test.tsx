import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { AppLoadingShell, SectionSkeleton } from "./loading-shell";

describe("AppLoadingShell", () => {
  test("announces the destination while keeping the mobile navigation available", () => {
    const html = renderToStaticMarkup(
      <AppLoadingShell active="Groups" label="Loading groups">
        <SectionSkeleton rows={2} />
      </AppLoadingShell>,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading groups");
    expect(html).toContain('aria-label="Home"');
    expect(html).toContain('aria-label="Record"');
    expect(html).toContain('aria-label="Groups"');
  });

  test("renders the requested number of stable skeleton rows", () => {
    const html = renderToStaticMarkup(<SectionSkeleton rows={3} />);

    expect((html.match(/data-skeleton-row="true"/g) ?? [])).toHaveLength(3);
  });
});
