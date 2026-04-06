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

  it("shows production and defense modifiers on affected tiles", () => {
    const foundry: Tile = {
      x: 20,
      y: 20,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "FOUNDRY", status: "active" }
    };
    const garrisonHall: Tile = {
      x: 22,
      y: 20,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "GARRISON_HALL", status: "active" }
    };
    const mine: Tile = {
      x: 27,
      y: 20,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      resource: "IRON",
      economicStructure: { ownerId: "me", type: "MINE", status: "active" }
    };

    expect(tileAreaEffectModifiersForTile(mine, [foundry, garrisonHall, mine])).toEqual([
      { reason: "Foundry", effect: "+100% iron production", tone: "positive" },
      { reason: "Garrison Hall", effect: "+20% defense", tone: "positive" }
    ]);
  });
});
