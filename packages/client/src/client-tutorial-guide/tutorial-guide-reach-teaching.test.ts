// Launch-scope item 3 (docs/gdd.md §9, docs/core-loop.md §12 tensions 4 and 5):
// the guide teaches reach as how a House grows, and its lines match the rules.

import { describe, expect, it } from "vitest";
import { OUTPOST_REACH_RADIUS } from "@border-empires/shared";
import { BEACON_WHY, GUIDE_STEPS } from "./tutorial-guide-steps.js";
import { foodCopy, TOWN_STEP } from "./tutorial-guide-foothold-copy.js";
import type { GuideInput } from "./tutorial-guide-steps.js";
import { turnFinishWhy } from "./tutorial-guide-turn-finish.js";

describe("the guide teaches reach, not Expand To, as how a House grows", () => {
  it("says the beacon moves reach, that claimed land is undefended until garrisoned, and that land beyond reach can't be garrisoned", () => {
    expect(BEACON_WHY).toContain(`${OUTPOST_REACH_RADIUS} tiles`);
    expect(BEACON_WHY).toContain("no defence until you garrison it");
    expect(BEACON_WHY).toContain("beyond your reach can't be garrisoned");
  });

  it("doesn't charge the first beacon a food slot it doesn't use", () => {
    expect(BEACON_WHY).not.toMatch(/uses one food slot/);
  });

  it("completes the reach step on a Relay Beacon only", () => {
    const step = GUIDE_STEPS.find((s) => s.id === "reach-beacon");
    expect(step?.isDone({ ownsRelayBeacon: false } as GuideInput)).toBe(false);
    expect(step?.isDone({ ownsRelayBeacon: true } as GuideInput)).toBe(true);
  });

  it("says Expand To is for crossing to a prize, since plain land beyond reach can't be garrisoned", () => {
    expect(TOWN_STEP.expand.why).toContain("Plain land beyond your reach can't be garrisoned");
  });

  it("doesn't call an unclaimed food target outside reach: the guide only marks food inside it", () => {
    const targets = { outOfReach: 0, unreachable: 0, pending: [], garrison: [], expand: [{ x: 1, y: 1 }] };
    const copy = foodCopy({ footholdTargets: { town: { ...targets, expand: [] }, food: targets }, scout: "none" } as unknown as GuideInput);
    expect(copy.title).toBe("Tap a marked food tile and Expand To it");
    expect(copy.why).toContain("inside your reach");
    expect(copy.why).not.toContain("outside your reach");
  });

  it("sends the player off without 'expand' as a verb", () => {
    for (const why of [turnFinishWhy({ current: 100, cap: 720 }, "Chronicle"), turnFinishWhy({ current: 2000, cap: 720 }, "Chronicle")]) {
      expect(why).toContain("explore for towns and resources, push your reach with beacons");
      expect(why).not.toMatch(/\bexpand\b/);
    }
  });
});
