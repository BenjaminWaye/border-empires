import { describe, expect, it } from "vitest";

import { settledDefenseNearFortDomainModifiers, structureAreaPreviewForTile, tileAreaEffectModifiersForTile } from "./client-structure-effects.js";
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

  it("shows percent-style area modifiers on affected tiles", () => {
    const foundry: Tile = {
      x: 20,
      y: 20,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "FOUNDRY", status: "active" }
    };
    const garrisonHall: Tile = {
      x: 23,
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

  it("shows owned domain defense bonuses on settled land near active forts", () => {
    const fort: Tile = {
      x: 40,
      y: 40,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      fort: { ownerId: "me", status: "active" }
    };
    const settledTile: Tile = {
      x: 41,
      y: 40,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED"
    };

    expect(
      tileAreaEffectModifiersForTile(settledTile, [fort, settledTile], settledDefenseNearFortDomainModifiers(
        [
          {
            id: "stone-curtain",
            tier: 2,
            name: "Stone Curtain",
            description: "",
            requiresTechId: "fortified-walls",
            mods: {},
            effects: { settledDefenseNearFortMult: 1.1 },
            requirements: { gold: 0, resources: {} }
          }
        ],
        ["stone-curtain"]
      ))
    ).toContainEqual({ reason: "Stone Curtain", effect: "+10% defense near forts", tone: "positive" });
  });

  it("prefers the selected tile fort state over a stale cached copy at the same coordinate", () => {
    const selectedFortTile: Tile = {
      x: 40,
      y: 40,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      detailLevel: "full",
      fort: { ownerId: "me", status: "active" }
    };
    const staleCachedTile: Tile = {
      x: 40,
      y: 40,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      detailLevel: "summary"
    };

    expect(
      tileAreaEffectModifiersForTile(selectedFortTile, [staleCachedTile], [
        { reason: "Stone Curtain", effect: "+10% defense near forts", tone: "positive" }
      ])
    ).toContainEqual({ reason: "Stone Curtain", effect: "+10% defense near forts", tone: "positive" });
  });

  it("shows the near-fort bonus for adjacent wooden forts too", () => {
    const woodenFort: Tile = {
      x: 40,
      y: 40,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "WOODEN_FORT", status: "active" }
    };
    const settledTile: Tile = {
      x: 41,
      y: 40,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED"
    };

    expect(
      tileAreaEffectModifiersForTile(settledTile, [woodenFort, settledTile], [
        { reason: "Stone Curtain", effect: "+10% defense near forts", tone: "positive" }
      ])
    ).toContainEqual({ reason: "Stone Curtain", effect: "+10% defense near forts", tone: "positive" });
  });
});
