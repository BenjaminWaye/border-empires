import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { RuntimeOwnerTileIndexes } from "./runtime-owner-tile-indexes.js";

const frontier: DomainTileState = { x: 3, y: 4, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER", resource: "TITANIUM" } as DomainTileState;
const settled = { ...frontier, ownershipState: "SETTLED" } as DomainTileState;
const built = { ...settled, economicStructure: { ownerId: "p1", type: "MINE", status: "under_construction" } } as unknown as DomainTileState;

describe("improvableTilesByOwner", () => {
  it("adds a resource tile once garrisoned, drops it once built on, and does not re-add it when the structure is removed", () => {
    const indexes = new RuntimeOwnerTileIndexes();
    indexes.refreshForTileChange("3,4", undefined, frontier);
    expect(indexes.improvableTilesByOwner.get("p1")?.has("3,4") ?? false).toBe(false);
    indexes.refreshForTileChange("3,4", frontier, settled);
    expect(indexes.improvableTilesByOwner.get("p1")?.has("3,4")).toBe(true);
    indexes.refreshForTileChange("3,4", settled, built);
    expect(indexes.improvableTilesByOwner.get("p1")?.has("3,4")).toBe(false);
    // Removed (or destroyed) in place: not a candidate again, so auto-improve doesn't rebuild it.
    indexes.refreshForTileChange("3,4", built, settled);
    expect(indexes.improvableTilesByOwner.get("p1")?.has("3,4")).toBe(false);
    indexes.refreshForTileChange("3,4", settled, { ...settled, ownerId: "p2" });
    expect(indexes.improvableTilesByOwner.get("p1")?.has("3,4")).toBe(false);
    expect(indexes.improvableTilesByOwner.get("p2")?.has("3,4")).toBe(true);
  });

  it("is seeded from boot tiles, and never lists a fish tile (no improvement) or a barbarian tile", () => {
    const indexes = new RuntimeOwnerTileIndexes();
    indexes.seedFromBootTile("3,4", settled);
    indexes.seedFromBootTile("5,5", { ...settled, resource: "FISH" } as DomainTileState);
    indexes.seedFromBootTile("6,6", { ...settled, ownerId: "barbarian-1" } as DomainTileState);
    expect([...(indexes.improvableTilesByOwner.get("p1") ?? [])]).toEqual(["3,4"]);
    expect(indexes.improvableTilesByOwner.has("barbarian-1")).toBe(false);
  });
});
