// Launch-scope item 3 (docs/gdd.md §9, docs/core-loop.md §12 tension 4): the
// guide teaches reach, not Expand To, as how a House grows. The wording itself
// is owned by the plain-words pass (tutorial-guide-plain-words.test.ts).

import { describe, expect, it } from "vitest";
import { GUIDE_STEPS, type GuideInput } from "./tutorial-guide-steps.js";

const beaconStep = GUIDE_STEPS.find((s) => s.id === "reach-beacon");
const afterTown = { checklist: { townExpanded: true }, ownsRelayBeacon: false, beaconSite: () => undefined } as unknown as GuideInput;

describe("the guide teaches reach, not Expand To, as how a House grows", () => {
  // Saved progress past this step also counts it done (doneIfLaterStepDone); that path is covered in tutorial-guide-steps.test.ts.
  it("ticks the reach step from game state only on a Relay Beacon, not on claimed land", () => {
    expect(beaconStep?.isDone({ ownsRelayBeacon: false } as GuideInput)).toBe(false);
    expect(beaconStep?.isDone({ ownsRelayBeacon: true } as GuideInput)).toBe(true);
  });

  it("says in the beacon step that Garrison only works inside reach, and names no food slot cost", () => {
    const why = typeof beaconStep?.why === "function" ? beaconStep.why(afterTown) : beaconStep?.why;
    expect(why).toContain("You can only Garrison inside it");
    expect(why).not.toMatch(/food slot/);
  });
});
