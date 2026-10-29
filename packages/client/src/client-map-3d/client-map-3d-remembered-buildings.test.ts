import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { addRememberedBuildingsForTile, type RememberedBuildingContext } from "./client-map-3d-remembered-buildings.js";

// Regression: buildings on fogged tiles used to vanish in 3D (the fog branch of
// the terrain rebuild drew only the ground). They now stay as last seen, but
// every layer is told to hold still and no build in progress is shown.
const layers = () => {
  const contactShadowOverlay = { addShadow: vi.fn() };
  return {
    townOverlay: { addInstance: vi.fn() },
    dockOverlay: { addInstance: vi.fn() },
    watchtowerOverlay: { addInstance: vi.fn() },
    waystationOverlay: { addInstance: vi.fn() },
    buildings: {
      contactShadowOverlay,
      structureOverlay: { addInstance: vi.fn() },
      umbriteExtractionRigOverlay: { addInstance: vi.fn() },
      umbriteWeaponsFactoryOverlay: { addInstance: vi.fn() },
      tradeNexusOverlay: { addInstance: vi.fn() },
      ambaricTransformerOverlay: { addInstance: vi.fn() },
      observatoryCooldownBadgeOverlay: { addInstance: vi.fn(), addSiphonModeInstance: vi.fn() }
    },
    fortifications: {
      contactShadowOverlay,
      fortOverlay: { addInstance: vi.fn() },
      relayBeaconOverlay: { addInstance: vi.fn() },
      siegeTowerOverlay: { addInstance: vi.fn() }
    }
  };
};

const context = (tiles: Map<string, Tile>, dockEndpointKeys = new Set<string>()): RememberedBuildingContext => ({
  state: { tiles, tilesRevision: 1, me: "me", siegeAimOverrides: new Map() },
  keyFor: (x, y) => `${x},${y}`, wrapX: (x) => x, wrapY: (y) => y,
  terrainAt: (x) => (x > 5 ? "SEA" : "LAND"), elevationAt: () => 0.1, dockEndpointKeys, rebuildStartAt: 0
});

const site = { x: 1, z: 2, surfaceY: 0.3, wx: 5, wy: 5, tileKey: "5,5" };

describe("remembered buildings on fogged 3D tiles", () => {
  it("draws the town, watchtower, waystation and dock standing still", () => {
    const target = layers();
    const tile: Tile = {
      x: 5, y: 5, terrain: "LAND", dockId: "d1",
      town: { type: "MARKET", populationTier: "CITY" } as Tile["town"],
      watchtower: { activated: false, revealUntil: Number.MAX_SAFE_INTEGER },
      waystation: { activated: false } as Tile["waystation"]
    };
    addRememberedBuildingsForTile(tile, site, target, context(new Map([["5,5", tile]])));
    expect(target.townOverlay.addInstance).toHaveBeenCalledWith(1, 2, 0.3, "CITY", 5, 5, true);
    expect(target.watchtowerOverlay.addInstance).toHaveBeenCalledWith(1, 2, 0.3, 5, 5, tile.watchtower, true);
    expect(target.waystationOverlay.addInstance).toHaveBeenCalledWith(1, 2, 0.3, 5, 5, tile.waystation, true);
    expect(target.dockOverlay.addInstance).toHaveBeenCalledTimes(1);
  });

  it("freezes structures, shows no build in progress and no owner badge", () => {
    const target = layers();
    const tile: Tile = {
      x: 5, y: 5, terrain: "LAND", ownerId: "me",
      economicStructure: { type: "MANUFACTORY", status: "under_construction", ownerId: "me", completesAt: Number.MAX_SAFE_INTEGER } as Tile["economicStructure"],
      observatory: { status: "active", ownerId: "me", cooldownUntil: Number.MAX_SAFE_INTEGER } as Tile["observatory"]
    };
    addRememberedBuildingsForTile(tile, site, target, context(new Map([["5,5", tile]])));
    expect(target.buildings.structureOverlay.addInstance).toHaveBeenCalledWith(1, 2, 0.3, "MANUFACTORY", undefined, undefined, true);
    expect(target.buildings.ambaricTransformerOverlay.addInstance).toHaveBeenCalledWith(1, 2, 0.3, 5, 5, true, false);
    expect(target.buildings.observatoryCooldownBadgeOverlay.addInstance).not.toHaveBeenCalled();
  });

  it("freezes siege towers and relay beacons", () => {
    const tower = layers();
    const towerTile: Tile = { x: 5, y: 5, terrain: "LAND", siegeBattery: { status: "active", ownerId: "p2", variant: "SIEGE_TOWER" } as Tile["siegeBattery"] };
    addRememberedBuildingsForTile(towerTile, site, tower, context(new Map([["5,5", towerTile]])));
    expect(tower.fortifications.siegeTowerOverlay.addInstance).toHaveBeenCalledWith(1, 2, 0.3, 5, 5, "SIEGE_TOWER", true);

    const beacon = layers();
    const beaconTile: Tile = { x: 5, y: 5, terrain: "LAND", economicStructure: { type: "RELAY_BEACON", status: "active", ownerId: "p2" } as Tile["economicStructure"] };
    addRememberedBuildingsForTile(beaconTile, site, beacon, context(new Map([["5,5", beaconTile]])));
    expect(beacon.fortifications.relayBeaconOverlay.addInstance).toHaveBeenCalledWith(1, 2, 0.3, 5, 5, true, undefined);
  });

  it("draws nothing on water", () => {
    const target = layers();
    addRememberedBuildingsForTile({ x: 5, y: 5, terrain: "SEA", dockId: "d1" }, site, target, context(new Map()));
    expect(target.dockOverlay.addInstance).not.toHaveBeenCalled();
  });
});
