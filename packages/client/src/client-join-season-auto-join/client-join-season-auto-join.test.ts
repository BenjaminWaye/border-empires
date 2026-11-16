import { beforeEach, describe, expect, it } from "vitest";
import { canAutoJoin, recordAutoJoin, resetAutoJoinForTests } from "./client-join-season-auto-join.js";

describe("auto-join", () => {
  const ready = { needsSeasonJoin: true, seasonPending: false, joinSeasonPending: false, profileSetupRequired: false, joinSeasonId: "season-1" };

  beforeEach(() => resetAutoJoinForTests());

  it("allows one automatic attempt per contest, however long the player waits (no retry loop)", () => {
    expect(canAutoJoin(ready)).toBe(true);
    recordAutoJoin(ready);
    expect(canAutoJoin(ready)).toBe(false);
  });

  it("gives a new contest a fresh attempt after a rollover", () => {
    recordAutoJoin(ready);
    expect(canAutoJoin({ ...ready, joinSeasonId: "season-2" })).toBe(true);
  });

  it.each([
    ["nothing to join", { needsSeasonJoin: false }],
    ["a pending season (the lobby countdown joins them)", { seasonPending: true }],
    ["a join already in flight", { joinSeasonPending: true }],
    ["profile setup not finished", { profileSetupRequired: true }]
  ])("does not fire for %s", (_label, override) => {
    expect(canAutoJoin({ ...ready, ...override })).toBe(false);
    expect(canAutoJoin(ready)).toBe(true);
  });
});
