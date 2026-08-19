import { describe, expect, test } from "vitest";
import { toCommandError } from "./result";

describe("toCommandError", () => {
  test("maps a database domain code to a stable user-facing result", () => {
    expect(toCommandError({ code: "MR403", message: "not a group member" }, "Could not save match.")).toEqual({
      ok: false,
      code: "NOT_GROUP_MEMBER",
      message: "You are not an active member of this group.",
    });
  });

  test("uses the supplied fallback for unknown database failures", () => {
    expect(toCommandError({ code: "XX000", message: "unexpected" }, "Could not save match.")).toEqual({
      ok: false,
      code: "UNKNOWN",
      message: "Could not save match.",
    });
  });

  test("explains that off-team match changes require an admin role", () => {
    expect(toCommandError({ code: "MRMAT", message: "forbidden" }, "Could not save match.")).toEqual({
      ok: false,
      code: "NOT_MATCH_EDITOR",
      message: "Only match participants or group admins can do that.",
    });
  });

  test("preserves a correction-window expiry as deadline-specific guidance", () => {
    expect(toCommandError({ code: "MREXP", message: "expired" }, "Could not correct match.")).toEqual({
      ok: false,
      code: "CORRECTION_EXPIRED",
      message: "The 30-day correction window has expired.",
    });
  });
});
