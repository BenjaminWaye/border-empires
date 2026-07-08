import { describe, expect, it } from "vitest";

import { parseSubscribeOptions } from "./parse-subscribe-options.js";

describe("parseSubscribeOptions", () => {
  it("defaults to live mode with a bootstrap event when no JSON is provided", () => {
    expect(parseSubscribeOptions(undefined)).toEqual({ mode: "live", emitBootstrapEvent: true, fullVisibility: false });
  });

  it("defaults to live mode on unparsable JSON", () => {
    expect(parseSubscribeOptions("{not json")).toEqual({ mode: "live", emitBootstrapEvent: true, fullVisibility: false });
  });

  it("parses bootstrap-only mode and suppresses the bootstrap event by default", () => {
    expect(parseSubscribeOptions(JSON.stringify({ mode: "bootstrap-only" }))).toEqual({
      mode: "bootstrap-only",
      emitBootstrapEvent: false,
      fullVisibility: false
    });
  });

  it("carries through subscriptionKey, fullVisibility, and trigger when present", () => {
    expect(
      parseSubscribeOptions(JSON.stringify({ mode: "live", subscriptionKey: "abc", fullVisibility: true, trigger: "reconnect" }))
    ).toEqual({
      mode: "live",
      emitBootstrapEvent: true,
      subscriptionKey: "abc",
      fullVisibility: true,
      trigger: "reconnect"
    });
  });
});
