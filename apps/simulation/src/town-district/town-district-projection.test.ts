import { tileDeltaRevealOnly } from "../tile-delta-reveal-only.js";
import { TileDeltaStringifyCache } from "../tile-delta-stringify-cache/tile-delta-stringify-cache.js";
import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_WIDTH } from "@border-empires/shared";
import { districtOverlayProjection, filterDistrictDeltasForRuntime, type DistrictProjectionState } from "./town-district-projection.js";
import { supportTileBelongsToTown } from "../economy-network/economy-network.js";

const town = (x: number, y: number, tier: "TOWN" | "METROPOLIS" = "METROPOLIS"): DomainTileState => ({
  x, y, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED",
  town: { name: "Test", type: "MARKET", populationTier: tier }
});
const structure = (x: number, y: number): DomainTileState => ({
  x, y, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED",
  economicStructure: { type: "MANUFACTORY", status: "active", ownerId: "p1" }
});
const index = (...tiles: DomainTileState[]): Map<string, DomainTileState> => new Map(tiles.map(t => [`${t.x},${t.y}`, t]));

describe("authoritative per-viewer district anchors", () => {
  it("enriches first exposure without leaking a hidden anchor through the shared cache", () => {
    const anchor = town(10, 10), building = structure(11, 10), tiles = index(anchor, building);
    const cache = new TileDeltaStringifyCache();
    const reveal = (canSee: (key: string) => boolean) => tileDeltaRevealOnly(building, cache, undefined, undefined, { tiles, canSee });
    expect(reveal(() => true).economicStructureJson).toContain('"supportAnchor":{"x":10,"y":10}');
    expect(reveal(key => key !== "10,10").economicStructureJson).not.toContain("supportAnchor");
    anchor.ownerId = "p2";
    expect(reveal(() => true).economicStructureJson).toContain('"supportAnchor":null');
  });
  it("preserves explicit overlay and ownership clears while normalizing optional scalar fields", () => {
    const state: DistrictProjectionState = { tiles: new Map(), players: new Map([["p1", { id: "p1", allies: new Set<string>(), techIds: new Set<string>(), domainIds: new Set<string>() }]]),
      locksByTile: { values: () => [] }, docks: [], dockLinksByDockTileKey: new Map(), visibilityCoverage: { isVisible: () => true } };
    const [delta] = filterDistrictDeltasForRuntime(state, [{ x: 10, y: 10, terrain: undefined,
      economicStructureJson: undefined, ownerId: undefined, ownershipState: undefined }], "p1", undefined,
      { hasFullVision: () => true, summaryForPlayer: () => ({ territoryTileKeys: new Set<string>() }) });
    expect(delta).not.toHaveProperty("terrain");
    expect(delta).toHaveProperty("economicStructureJson", undefined);
    expect(delta).toHaveProperty("ownerId", undefined);
    expect(delta).toHaveProperty("ownershipState", undefined);
  });
  it("refreshes unchanged visible neighbours on town capture without copying combat payloads or clearing ownership", () => {
    const anchor = town(10, 10), building = structure(12, 10), tiles = index(anchor, building);
    anchor.ownerId = "p2";
    const state: DistrictProjectionState = { tiles, players: new Map([
      ["p1", { id: "p1", allies: new Set<string>(), techIds: new Set<string>(), domainIds: new Set<string>() }]
    ]), locksByTile: { values: () => [] }, docks: [], dockLinksByDockTileKey: new Map(), visibilityCoverage: { isVisible: () => true } };
    const deltas = filterDistrictDeltasForRuntime(state, [{ x: 10, y: 10, townJson: JSON.stringify(anchor.town), combatJson: "battle" }], "p1", undefined,
      { summaryForPlayer: () => ({ territoryTileKeys: new Set<string>() }) });
    expect(deltas.find(tile => tile.x === 12)).toMatchObject({ ownerId: "p1", ownershipState: "SETTLED", visibilityState: "VISIBLE" });
    expect(deltas.find(tile => tile.x === 12)?.economicStructureJson).toContain('"supportAnchor":null');
    expect(deltas.find(tile => tile.x === 12)).not.toHaveProperty("combatJson");
  });
  it("matches economy assignment on overlap, not nearest visible town", () => {
    const first = town(10, 10), nearest = town(12, 10), building = structure(12, 11);
    const tiles = index(first, nearest, building);
    expect(supportTileBelongsToTown("p1", building, first, tiles)).toBe(true);
    expect(districtOverlayProjection(tiles, building, () => true).economicStructureJson).toContain('"supportAnchor":{"x":10,"y":10}');
  });
  it("never leaks a hidden anchor and does not reassign to a visible competitor", () => {
    const tiles = index(town(10, 10), town(12, 10), structure(12, 11));
    const output = districtOverlayProjection(tiles, tiles.get("12,11")!, key => key !== "10,10");
    expect(output.economicStructureJson).not.toContain("supportAnchor");
    expect(output.economicStructureJson).not.toContain('"x":10');
  });
  it("sends a confirmed absent anchor after the town is lost, without persisting derived metadata", () => {
    const anchor = town(10, 10), building = structure(12, 10), tiles = index(anchor, building);
    anchor.ownerId = "p2";
    expect(districtOverlayProjection(tiles, building, () => true).economicStructureJson).toContain('"supportAnchor":null');
    expect(building.economicStructure).not.toHaveProperty("supportAnchor");
  });
  it("supports second rings and wraps across the world seam", () => {
    const anchor = town(0, 20), building = structure(WORLD_WIDTH - 2, 20);
    expect(districtOverlayProjection(index(anchor, building), building, () => true).economicStructureJson).toContain('"supportAnchor":{"x":0,"y":20}');
    anchor.town = { ...anchor.town!, populationTier: "TOWN" };
    expect(districtOverlayProjection(index(anchor, building), building, () => true).economicStructureJson).toContain('"supportAnchor":null');
  });
  it("gives dedicated Aether Tower records the same metadata", () => {
    const anchor = town(10, 10), tower: DomainTileState = { x: 11, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", observatory: { ownerId: "p1", status: "active" } };
    expect(districtOverlayProjection(index(anchor, tower), tower, () => true).observatoryJson).toContain('"supportAnchor":{"x":10,"y":10}');
  });
});
