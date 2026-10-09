import { describe, expect, it } from "vitest";
import { createVictoryResourceTally, resourceRevealedByTechs, tallyVictoryResourceTile } from "./victory-resource-tally.js";

const REVEALS: Record<string, string> = { masonry: "titanium", leatherworking: "umbrite", "crystal-lattices": "crystal" };
const revealCategoryForTech = (techId: string): string | undefined => REVEALS[techId];

describe("resourceRevealedByTechs", () => {
  it("always reveals food and maps GEMS onto the crystal category", () => {
    expect(resourceRevealedByTechs("FARM", [], revealCategoryForTech)).toBe(true);
    expect(resourceRevealedByTechs("FISH", [], revealCategoryForTech)).toBe(true);
    expect(resourceRevealedByTechs("GEMS", [], revealCategoryForTech)).toBe(false);
    expect(resourceRevealedByTechs("GEMS", ["crystal-lattices"], revealCategoryForTech)).toBe(true);
    expect(resourceRevealedByTechs("UMBRITE", ["masonry"], revealCategoryForTech)).toBe(false);
    expect(resourceRevealedByTechs("UMBRITE", ["leatherworking"], revealCategoryForTech)).toBe(true);
  });
});

describe("tallyVictoryResourceTile", () => {
  it("counts every resource tile toward the world total but only settled, revealed tiles toward the owner", () => {
    const tally = createVictoryResourceTally();
    const tiles = [
      { resource: "UMBRITE", ownerId: "a", ownershipState: "SETTLED" }, // a lacks leatherworking: hidden
      { resource: "UMBRITE", ownerId: "b", ownershipState: "FRONTIER" }, // frontier: not control
      { resource: "UMBRITE", ownerId: "b", ownershipState: "SETTLED" }, // counts for b
      { resource: "UMBRITE", ownerId: "outsider", ownershipState: "SETTLED" }, // non-competitive owner
      { resource: "UMBRITE" },
      { ownerId: "b", ownershipState: "SETTLED" } // no resource
    ];
    const techs = new Map<string, readonly string[]>([["a", []], ["b", ["leatherworking"]]]);
    for (const tile of tiles) {
      tallyVictoryResourceTile(tally, tile, tile.ownerId ? techs.get(tile.ownerId) : undefined, revealCategoryForTech);
    }
    expect(tally.totalResourceCounts.UMBRITE).toBe(5);
    expect(tally.ownedResourceCountsByPlayerId.get("a")).toBeUndefined();
    expect(tally.ownedResourceCountsByPlayerId.get("b")?.UMBRITE).toBe(1);
    expect(tally.ownedResourceCountsByPlayerId.has("outsider")).toBe(false);
  });
});
