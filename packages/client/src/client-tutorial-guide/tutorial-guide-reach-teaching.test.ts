// Launch-scope item 3 (docs/gdd.md §9, docs/core-loop.md §12 tension 4): the
// guide teaches reach, not Expand To, as how a House grows. The step wording
// itself is owned by the plain-words pass (tutorial-guide-plain-words.test.ts).

import { describe, expect, it } from "vitest";
import { GUIDE_STEPS, type GuideInput } from "./tutorial-guide-steps.js";
import { turnFinishWhy } from "./tutorial-guide-turn-finish.js";

const beaconStep = GUIDE_STEPS.find((s) => s.id === "reach-beacon");
const afterTown = { checklist: { townExpanded: true }, ownsRelayBeacon: false, beaconSite: () => undefined } as unknown as GuideInput;

describe("the guide teaches reach, not Expand To, as how a House grows", () => {
  it("completes the reach step on a Relay Beacon only", () => {
    expect(beaconStep?.isDone({ ownsRelayBeacon: false } as GuideInput)).toBe(false);
    expect(beaconStep?.isDone({ ownsRelayBeacon: true } as GuideInput)).toBe(true);
  });

  it("says in the beacon step that Garrison only works inside reach, and charges no food slot (the first five beacons need none)", () => {
    const why = typeof beaconStep?.why === "function" ? beaconStep.why(afterTown) : beaconStep?.why;
    expect(why).toContain("You can only Garrison inside it");
    expect(why).not.toMatch(/food slot/);
  });

  it("sends the player off without 'expand' as a verb", () => {
    for (const why of [turnFinishWhy({ current: 100, cap: 720 }, "Chronicle"), turnFinishWhy({ current: 2000, cap: 720 }, "Chronicle")]) {
      expect(why).toContain("explore for towns and resources, push your reach with beacons");
      expect(why).not.toMatch(/\bexpand\b/);
    }
  });
});
