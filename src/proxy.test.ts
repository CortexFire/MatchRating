import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from "next/experimental/testing/server";
import { describe, expect, test } from "vitest";
import { config } from "./proxy";

describe("proxy matcher", () => {
  test.each([
    "/.well-known/workflow/v1/flow",
    "/.well-known/workflow/v1/step",
    "/.well-known/workflow/v1/webhook/token",
  ])("does not intercept Workflow endpoint %s", (url) => {
    expect(unstable_doesProxyMatch({ config, nextConfig: {}, url })).toBe(false);
  });

  test("continues intercepting application routes", () => {
    expect(unstable_doesProxyMatch({ config, nextConfig: {}, url: "/groups/group-1" })).toBe(true);
  });
});
