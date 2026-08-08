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
});
