import { describe, expect, it } from "vitest";

import { structureKeyForTile } from "./client-tile-menu-structure-label.js";
import type { Tile } from "../client-types.js";

const baseTile: Tile = {
  x: 90,
  y: 329,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED"
};

describe("structureKeyForTile", () => {
  it("returns the economic structure's type", () => {
    const key = structureKeyForTile({ ...baseTile, economicStructure: { ownerId: "me", type: "UMBRITE_SYNTHESIZER", status: "active" } });
    expect(key).toBe("UMBRITE_SYNTHESIZER");
  });

  it("returns the fort's variant, defaulting to FORT", () => {
    expect(structureKeyForTile({ ...baseTile, fort: { ownerId: "me", status: "active", variant: "TITANIUM_BASTION" } })).toBe("TITANIUM_BASTION");
    expect(structureKeyForTile({ ...baseTile, fort: { ownerId: "me", status: "active" } })).toBe("FORT");
  });

  it("returns undefined when no structure is built", () => {
    expect(structureKeyForTile(baseTile)).toBeUndefined();
  });
});
