import { describe, expect, it } from "vitest";

import { structureAreaPreviewForTile, tileAreaEffectModifiersForTile } from "./client-structure-effects.js";
import type { Tile } from "./client-types.js";

describe("client structure effects", () => {
  it("exposes preview metadata for area structures", () => {
    const preview = structureAreaPreviewForTile({
      x: 40,
      y: 40,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "FOUNDRY", status: "active" }
    });

    expect(preview?.radius).toBe(10);
    expect(preview?.lineDash).toEqual([10, 8]);
  });

  it("shows the foundry bonus amount on affected mine tiles", () => {
    const foundry: Tile = {
      x: 20,
      y: 20,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "FOUNDRY", status: "active" }
    };
    const mine: Tile = {
      x: 27,
      y: 20,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      resource: "IRON",
      economicStructure: { ownerId: "me", type: "MINE", status: "active" },
      yieldRate: { strategicPerDay: { IRON: 12 } }
    };

    expect(tileAreaEffectModifiersForTile(mine, [foundry, mine])).toEqual([
      { name: "Foundry", mod: "+6.0/day iron", tone: "positive" }
    ]);
  });
});
