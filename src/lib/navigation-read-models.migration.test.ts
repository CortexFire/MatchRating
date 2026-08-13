import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const migrationSource = () => readFileSync(
  join(process.cwd(), "supabase/migrations/20260813120000_consolidate_navigation_read_models.sql"),
  "utf8",
);

describe("navigation read-model migration", () => {
  test("limits recorder roster hydration without narrowing home or group models", () => {
    const source = migrationSource();
    const home = functionBody(source, "get_home_page_data", "get_group_page_data");
    const group = functionBody(source, "get_group_page_data", "get_match_recorder_page_data");
    const recorder = functionBody(source, "get_match_recorder_page_data", "revoke all");

    expect(home).not.toContain("p_group_id");
    expect(home).toContain("visible_group_memberships(v_group_ids)");
    expect(group).toContain("visible_group_memberships(v_group_ids)");
    expect(recorder).toContain("visible_group_memberships(array[p_group_id])");
    expect(recorder).not.toContain("visible_group_memberships(v_group_ids)");
  });
});

function functionBody(source: string, startName: string, endMarker: string) {
  const start = source.indexOf(`create or replace function public.${startName}`);
  const end = source.indexOf(endMarker.startsWith("get_")
    ? `create or replace function public.${endMarker}`
    : endMarker, start + 1);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}
