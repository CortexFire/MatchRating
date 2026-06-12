import { describe, expect, it } from "vitest";
import { createInviteToken, hashInviteToken } from "./tokens";

describe("invite tokens", () => {
  it("creates high-entropy URL-safe tokens and stable hashes", () => {
    const token = createInviteToken();
    const hash = hashInviteToken(token);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toHaveLength(64);
    expect(hashInviteToken(token)).toBe(hash);
    expect(hashInviteToken(createInviteToken())).not.toBe(hash);
  });
});
