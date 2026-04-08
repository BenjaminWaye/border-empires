import { describe, expect, it } from "vitest";

import { resolveFailedBarbarianDefenseOutcome } from "./barbarian-defense.js";

describe("resolveFailedBarbarianDefenseOutcome", () => {
  it("keeps the barbarian on the defended tile when a fort blocks the counter-capture", () => {
    expect(
      resolveFailedBarbarianDefenseOutcome({
        fortHeldOrigin: true,
        origin: { x: 4, y: 7 },
        target: { x: 5, y: 7 }
      })
    ).toEqual({
      resultChanges: [],
      originLost: false,
      defenderTile: { x: 5, y: 7 }
    });
  });

  it("counter-captures the origin and vacates the defended tile when no fort protects the origin", () => {
    expect(
      resolveFailedBarbarianDefenseOutcome({
        fortHeldOrigin: false,
        origin: { x: 4, y: 7 },
        target: { x: 5, y: 7 }
      })
    ).toEqual({
      resultChanges: [
        { x: 4, y: 7, ownerId: "barbarian", ownershipState: "BARBARIAN" },
        { x: 5, y: 7 }
      ],
      originLost: true,
      defenderTile: { x: 4, y: 7 }
    });
  });
});
