import { describe, expect, it } from "vitest";

import { isLocalDevHostname, resolveDevAuthPlayerId } from "./client-dev-auth-bypass.js";

describe("client dev auth bypass", () => {
  it("recognizes localhost-family hostnames", () => {
    expect(isLocalDevHostname("localhost")).toBe(true);
    expect(isLocalDevHostname("127.0.0.1")).toBe(true);
    expect(isLocalDevHostname("0.0.0.0")).toBe(true);
    expect(isLocalDevHostname("Localhost")).toBe(true);
  });

  it("rejects non-local hostnames, including lookalikes", () => {
    expect(isLocalDevHostname("play.borderempires.com")).toBe(false);
    expect(isLocalDevHostname("staging.borderempires.com")).toBe(false);
    expect(isLocalDevHostname("localhost.attacker.example")).toBe(false);
  });

  it("returns the devPlayerId query param on localhost", () => {
    expect(resolveDevAuthPlayerId("localhost", "?devPlayerId=player-1")).toBe("player-1");
    expect(resolveDevAuthPlayerId("127.0.0.1", "?devPlayerId=player-1&foo=bar")).toBe("player-1");
  });

  it("never resolves a dev player id off localhost, even if the param is present", () => {
    expect(resolveDevAuthPlayerId("play.borderempires.com", "?devPlayerId=player-1")).toBeUndefined();
    expect(resolveDevAuthPlayerId("staging.borderempires.com", "?devPlayerId=player-1")).toBeUndefined();
  });

  it("returns undefined when the query param is absent or blank on localhost", () => {
    expect(resolveDevAuthPlayerId("localhost", "")).toBeUndefined();
    expect(resolveDevAuthPlayerId("localhost", "?devPlayerId=")).toBeUndefined();
    expect(resolveDevAuthPlayerId("localhost", "?devPlayerId=%20")).toBeUndefined();
  });
});
