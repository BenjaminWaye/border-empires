import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { addBuildingInstancesForTile } from "./client-map-3d-building-instances.js";
import { addFortificationInstancesForTile } from "../client-map-3d-fortification-instances.js";

const site = { x: 0, z: 0, surfaceY: 0, wx: 0, wy: 0 };
const state = { tiles: new Map<string, Tile>(), tilesRevision: 1, me: "me" };
const overlays = () => ({
  contactShadowOverlay: { addShadow: vi.fn() },
  structureOverlay: { addInstance: vi.fn() },
  umbriteExtractionRigOverlay: { addInstance: vi.fn() },
  umbriteWeaponsFactoryOverlay: { addInstance: vi.fn() },
  tradeNexusOverlay: { addInstance: vi.fn() },
  ambaricTransformerOverlay: { addInstance: vi.fn() },
  observatoryCooldownBadgeOverlay: { addInstance: vi.fn(), addSiphonModeInstance: vi.fn() }
});

describe.each(["under_construction", "removing", "active", "inactive"] as const)("%s building routing", (status) => {
  it.each(["TRADE_NEXUS", "UMBRITE_WEAPONS_FACTORY"] as const)("passes construction state to %s", (type) => {
    const target = overlays();
    const tile: Tile = { x: 0, y: 0, terrain: "LAND", economicStructure: { type, status, ownerId: "me", pausedAt: 10 } };
    addBuildingInstancesForTile(tile, site, target, state, 0, undefined);
    const add = type === "TRADE_NEXUS" ? target.tradeNexusOverlay.addInstance : target.umbriteWeaponsFactoryOverlay.addInstance;
    expect(add).toHaveBeenCalledWith(0, 0, 0, 0, 0, status === "under_construction" || status === "removing");
  });
  it("passes construction and disabled state to the observatory", () => {
    const target = overlays();
    const tile: Tile = { x: 0, y: 0, terrain: "LAND", observatory: { status, ownerId: "me", pausedAt: 10 } };
    addBuildingInstancesForTile(tile, site, target, state, 0, undefined);
    expect(target.ambaricTransformerOverlay.addInstance).toHaveBeenCalledWith(
      0, 0, 0, 0, 0, status === "under_construction" || status === "removing", status === "inactive"
    );
  });
});

it.each(["under_construction", "removing", "active"] as const)("routes %s siege tower construction state", (status) => {
  const addInstance = vi.fn();
  const tile: Tile = { x: 0, y: 0, terrain: "LAND", siegeBattery: { status, ownerId: "me", variant: "SIEGE_TOWER" } };
  addFortificationInstancesForTile(tile, site, {
    siegeTowerOverlay: { addInstance }, fortOverlay: { addInstance: vi.fn() },
    relayBeaconOverlay: { addInstance: vi.fn() }, contactShadowOverlay: { addShadow: vi.fn() }
  }, { state: { ...state, siegeAimOverrides: new Map() }, keyFor: (x, y) => `${x},${y}`, wrapX: (x) => x, wrapY: (y) => y }, 0);
  expect(addInstance).toHaveBeenCalledWith(0, 0, 0, 0, 0, "SIEGE_TOWER", status !== "active");
});
