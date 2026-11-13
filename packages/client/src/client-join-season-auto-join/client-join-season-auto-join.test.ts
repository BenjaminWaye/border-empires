import { beforeEach, describe, expect, it } from "vitest";
import { resetAutoJoinForTests, takeAutoJoinTurn } from "./client-join-season-auto-join.js";

describe("takeAutoJoinTurn", () => {
  const ready = { needsSeasonJoin: true, seasonPending: false, joinSeasonPending: false, profileSetupRequired: false };

  beforeEach(() => resetAutoJoinForTests());

  it("lets a player waiting to join an active season through, once", () => {
    expect(takeAutoJoinTurn(ready, 100_000)).toBe(true);
    expect(takeAutoJoinTurn(ready, 100_500)).toBe(false);
  });

  it("allows another attempt after a while, so a join that did not spawn is retried but never in a tight loop", () => {
    expect(takeAutoJoinTurn(ready, 100_000)).toBe(true);
    expect(takeAutoJoinTurn(ready, 110_000)).toBe(false);
    expect(takeAutoJoinTurn(ready, 115_001)).toBe(true);
  });

  it.each([
    ["nothing to join", { needsSeasonJoin: false }],
    ["a pending season (the lobby countdown joins them)", { seasonPending: true }],
    ["a join already in flight", { joinSeasonPending: true }],
    ["profile setup not finished", { profileSetupRequired: true }]
  ])("does not fire for %s", (_label, override) => {
    expect(takeAutoJoinTurn({ ...ready, ...override }, 100_000)).toBe(false);
    // a refusal must not use up the turn
    expect(takeAutoJoinTurn(ready, 100_000)).toBe(true);
  });
});
