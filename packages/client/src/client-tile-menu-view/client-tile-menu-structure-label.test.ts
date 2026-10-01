import { describe, expect, it } from "vitest";

import { structureKeysForTile } from "./client-tile-menu-structure-label.js";
import type { Tile } from "../client-types.js";

const baseTile: Tile = {
  x: 90,
  y: 329,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED"
};

describe("structureKeysForTile", () => {
  it("returns the economic structure's type", () => {
    const keys = structureKeysForTile({ ...baseTile, economicStructure: { ownerId: "me", type: "UMBRITE_SYNTHESIZER", status: "active" } });
    expect(keys).toEqual(["UMBRITE_SYNTHESIZER"]);
  });

  it("returns the fort's variant, defaulting to FORT", () => {
    expect(structureKeysForTile({ ...baseTile, fort: { ownerId: "me", status: "active", variant: "TITANIUM_BASTION" } })).toEqual(["TITANIUM_BASTION"]);
    expect(structureKeysForTile({ ...baseTile, fort: { ownerId: "me", status: "active" } })).toEqual(["FORT"]);
  });

  it("lists a fort and the Relay Beacon it stacks on, fortification first", () => {
    const tile: Tile = {
      ...baseTile,
      fort: { ownerId: "me", status: "active", variant: "FORT" },
      economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" }
    };
    expect(structureKeysForTile(tile)).toEqual(["FORT", "RELAY_BEACON"]);
  });

  it("names a Palisade stacked on a Relay Beacon", () => {
    const tile: Tile = {
      ...baseTile,
      fort: { ownerId: "me", status: "active", variant: "WOODEN_FORT" },
      economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" }
    };
    expect(structureKeysForTile(tile)).toEqual(["WOODEN_FORT", "RELAY_BEACON"]);
  });

  it("names a fort mid-upgrade by the tier still standing", () => {
    const tile: Tile = { ...baseTile, fort: { ownerId: "me", status: "under_construction", variant: "FORT", upgradingFrom: "WOODEN_FORT" } };
    expect(structureKeysForTile(tile)).toEqual(["WOODEN_FORT"]);
  });

  it("returns an empty list when no structure is built", () => {
    expect(structureKeysForTile(baseTile)).toEqual([]);
  });
});
