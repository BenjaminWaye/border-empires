import type { DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";

import { capturedStructureFields } from "../capture-structures/capture-structures.js";
import { featureSurvivesCapture, flipFeatures, tileFeaturesForActivity } from "./territory-flip-features.js";

const tile = (overrides: Partial<DomainTileState> = {}): DomainTileState => ({ x: 211, y: 186, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...overrides });

describe("tileFeaturesForActivity", () => {
  it("lists the standing fortification, buildings and wonder, but not a town, a dock or an unfinished build", () => {
    expect(tileFeaturesForActivity(tile({
      fort: { ownerId: "me", status: "active", variant: "PALISADE" },
      economicStructure: { ownerId: "me", type: "MINE", status: "under_construction" },
      dockId: "dock-3",
      naturalWonder: { type: "FOUNDRY_HEART" },
      town: { type: "MARKET", populationTier: "TOWN" }
    }))).toEqual([
      { kind: "STRUCTURE", structureType: "PALISADE" },
      { kind: "NATURAL_WONDER", wonderType: "FOUNDRY_HEART" }
    ]);
    // A fort mid-upgrade still stands as its old tier.
    expect(tileFeaturesForActivity(tile({ fort: { ownerId: "me", status: "under_construction", variant: "FORT", upgradingFrom: "PALISADE" } })))
      .toEqual([{ kind: "STRUCTURE", structureType: "PALISADE" }]);
    expect(tileFeaturesForActivity(tile())).toEqual([]);
    expect(flipFeatures(tile())).toEqual({});
  });

  // featureSurvivesCapture mirrors capturedStructureFields' razing rule; this
  // fails if either changes without the other.
  it("credits the captor with exactly what capturedStructureFields hands over", () => {
    const tiles: DomainTileState[] = [
      tile({ fort: { ownerId: "me", status: "removing", variant: "FORT" } }),
      tile({ fort: { ownerId: "me", status: "under_construction", variant: "TITANIUM_BASTION", upgradingFrom: "FORT" } }),
      tile({ observatory: { ownerId: "me", status: "inactive" } }),
      tile({ siegeBattery: { ownerId: "me", status: "active", variant: "DREAD_TOWER" } }),
      tile({ siegeBattery: { ownerId: "me", status: "active" } }),
      tile({ economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" } }),
      tile({ economicStructure: { ownerId: "me", type: "MINE", status: "removing" } }),
      tile({ afc: { ownerId: "me", status: "active" } })
    ];
    for (const before of tiles) {
      const after = { ...before, ownerId: "maren", ...capturedStructureFields(before, "maren", 0) };
      expect(tileFeaturesForActivity(before).filter(featureSurvivesCapture)).toEqual(tileFeaturesForActivity(after));
    }
  });
});

it("keeps the relic version in captured feature records so old and new names remain distinguishable", () => {
  expect(tileFeaturesForActivity(tile({ naturalWonder: { type: "WARPRESS", relicVersion: 1 } }))).toEqual([{ kind: "NATURAL_WONDER", wonderType: "WARPRESS", relicVersion: 1 }]);
});
