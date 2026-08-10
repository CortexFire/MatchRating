import { describe, expect, test } from "vitest";
import { DEFAULT_AUTH_NEXT_PATH, getSafeAuthNextPath } from "./next-path";

describe("getSafeAuthNextPath", () => {
  test.each([
    { value: undefined, want: "/onboarding" },
    { value: null, want: "/onboarding" },
    { value: "", want: "/onboarding" },
    { value: ["/groups/group-1", "/ignored"], want: "/groups/group-1" },
    { value: "/onboarding?invite=invite-token#details", want: "/onboarding?invite=invite-token#details" },
    { value: "/groups/one/../two?filter=active#members", want: "/groups/two?filter=active#members" },
    { value: "/onboarding?return=%2Fgroups%2Fgroup-1#%5Cfragment", want: "/onboarding?return=%2Fgroups%2Fgroup-1#%5Cfragment" },
  ])("returns canonical local destination for $value", ({ value, want }) => {
    expect(getSafeAuthNextPath(value)).toBe(want);
  });

  test.each([
    "https://evil.example.com",
    "javascript:alert(1)",
    "//evil.example.com",
    "/\\evil.example.com",
    "/groups\\group-1",
    "/%2F%2Fevil.example.com",
    "/groups%2Fgroup-1",
    "/groups%5Cgroup-1",
    "/groups%252Fgroup-1",
    "/groups%255Cgroup-1",
    "/groups%25252Fgroup-1",
  ])("returns the default for unsafe destination %s", (value) => {
    expect(getSafeAuthNextPath(value)).toBe(DEFAULT_AUTH_NEXT_PATH);
  });
});
