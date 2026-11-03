// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { tileKey } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { scanGuideTiles } from "./tutorial-guide-input.js";

const ME = "p1";
const map = (tiles: Array<Partial<Tile> & { x: number; y: number }>): ReadonlyMap<string, Tile> =>
  new Map(tiles.map((t) => [tileKey(t.x, t.y), { terrain: "LAND", ...t } as Tile]));

describe("scanGuideTiles", () => {
  it("does not count a Relay Beacon as the first building (it needs no Manifest), but counts any other structure", () => {
    const beaconOnly = map([{ x: 0, y: 0, ownerId: ME, ownershipState: "SETTLED", economicStructure: { ownerId: ME, type: "RELAY_BEACON" } as never }]);
    expect(scanGuideTiles(beaconOnly, ME, undefined).ownsBuiltStructure).toBe(false);
    const garden = map([{ x: 0, y: 0, ownerId: ME, ownershipState: "SETTLED", economicStructure: { ownerId: ME, type: "HYDROGARDEN" } as never }]);
    expect(scanGuideTiles(garden, ME, undefined).ownsBuiltStructure).toBe(true);
  });

  it("targets the player's own garrisoned towns for the Manufactory, nearest home first", () => {
    const town = { town: { type: "MARKET", populationTier: "TOWN" } as never };
    const tiles = map([
      { x: 9, y: 0, ownerId: ME, ownershipState: "SETTLED", ...town },
      { x: 1, y: 0, ownerId: ME, ownershipState: "SETTLED", ...town },
      { x: 2, y: 0, ownerId: ME, ownershipState: "FRONTIER", ...town },
      { x: 3, y: 0, ...town },
      { x: 4, y: 0, ownerId: ME, ownershipState: "SETTLED", resource: "FARM" }
    ]);
    expect(scanGuideTiles(tiles, ME, { x: 0, y: 0 }).buildTargetTiles).toEqual([
      { x: 1, y: 0 },
      { x: 9, y: 0 }
    ]);
  });

  it("targets own garrisoned border tiles that touch another owner for the muster flag", () => {
    const tiles = map([
      { x: 0, y: 0, ownerId: ME, ownershipState: "SETTLED" },
      { x: 1, y: 0, ownerId: ME, ownershipState: "SETTLED" },
      { x: 2, y: 0, ownerId: "barbarian" }
    ]);
    const scan = scanGuideTiles(tiles, ME, { x: 0, y: 0 });
    expect(scan.musterTargetTiles).toEqual([{ x: 1, y: 0 }]);
    expect(scan.ownsMusterFlag).toBe(false);
  });
});

describe("buildGuideInput", () => {
  it("rescans tiles after a chunk load, which writes tiles without bumping tilesRevision", async () => {
    const { createInitialState } = await import("../client-state/client-state.js");
    const { buildGuideInput, resetGuideInputCacheForTests } = await import("./tutorial-guide-input.js");
    resetGuideInputCacheForTests();
    const state = createInitialState();
    state.me = ME;
    state.tiles.set(tileKey(0, 0), { x: 0, y: 0, terrain: "LAND", ownerId: ME, ownershipState: "SETTLED" } as Tile);
    expect(buildGuideInput(state).checklist.townFound).toBe(false);
    state.tiles.set(tileKey(2, 0), { x: 2, y: 0, terrain: "LAND", town: { type: "MARKET", populationTier: "TOWN" } } as Tile);
    state.chunkFullCount += 1;
    expect(buildGuideInput(state).checklist.townFound).toBe(true);
  });
});

describe("scanGuideFootholdTargets", () => {
  it("splits own frontier towns and food (Garrison) from neutral ones in vision (Expand To), ignoring fogged, enemy, garrisoned and spawn-settlement tiles", async () => {
    const { scanGuideFootholdTargets } = await import("./tutorial-guide-foothold-targets.js");
    const town = (populationTier: string) => ({ town: { type: "MARKET", populationTier } as never });
    const tiles = map([
      { x: 0, y: 0, ownerId: ME, ownershipState: "SETTLED", ...town("SETTLEMENT") },
      { x: 2, y: 0, ownerId: ME, ownershipState: "FRONTIER", ...town("TOWN") },
      { x: 9, y: 0, ...town("TOWN") },
      { x: 12, y: 0, fogged: true, ...town("TOWN") },
      { x: 14, y: 0, ownerId: "rival", ownershipState: "SETTLED", ...town("TOWN") },
      { x: 16, y: 0, ownerId: ME, ownershipState: "SETTLED", ...town("CITY") },
      { x: 1, y: 1, ownerId: ME, ownershipState: "FRONTIER", resource: "FISH" },
      { x: 3, y: 3, resource: "FARM" },
      { x: 4, y: 4, resource: "FARM", fogged: true },
      { x: 5, y: 5, ownerId: ME, ownershipState: "SETTLED", resource: "FARM" },
      { x: 6, y: 6, resource: "TITANIUM" }
    ]);
    expect(scanGuideFootholdTargets(tiles.values(), ME, () => 0)).toEqual({
      town: { garrison: [{ x: 2, y: 0 }], expand: [{ x: 9, y: 0 }] },
      food: { garrison: [{ x: 1, y: 1 }], expand: [{ x: 3, y: 3 }] }
    });
  });
});

describe("rival House contact and diplomacy", () => {
  it("counts another House's land, not Planetary Defense, and marks diplomacy used once a truce is offered", async () => {
    const { createInitialState } = await import("../client-state/client-state.js");
    const { buildGuideInput, resetGuideInputCacheForTests } = await import("./tutorial-guide-input.js");
    resetGuideInputCacheForTests();
    const state = createInitialState();
    state.me = ME;
    state.tiles.set(tileKey(5, 5), { x: 5, y: 5, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" } as Tile);
    state.tilesRevision += 1;
    expect(buildGuideInput(state).rivalHouseMet).toBe(false);
    state.tiles.set(tileKey(6, 5), { x: 6, y: 5, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED" } as Tile);
    state.tilesRevision += 1;
    expect(buildGuideInput(state).rivalHouseMet).toBe(true);
    expect(buildGuideInput(state).diplomacyUsed).toBe(false);
    state.outgoingTruceRequests.push({} as never);
    expect(buildGuideInput(state).diplomacyUsed).toBe(true);
  });
});
