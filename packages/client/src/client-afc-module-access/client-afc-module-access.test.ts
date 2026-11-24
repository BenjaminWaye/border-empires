import { describe, expect, it } from "vitest";
import { hasBuildTech, installedAfcModuleIds } from "./client-afc-module-access.js";
import { hideTechLockedTileAction, type TileActionFilterState } from "../client-tile-action-support/client-tech-locked-tile-action.js";
import type { Tile, TileActionDef } from "../client-types.js";

// Regression: a captured AFC's module (never researched by the captor) did
// not unlock its buildings, because every build row also required research.
const capturedAfc = (modules: string[]): Tile => ({
  x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
  afc: { ownerId: "me", status: "active", modules, houseModules: [], capturedModuleHouses: { trade: "rival" } }
});

const tradeModule = {
  id: "trade", name: "Industrial Tooling Module", branch: "economy", tier: 1,
  manifestCategory: "AFC_MODULE" as const, description: "", mods: {},
  effects: { unlockManufactory: true }, requirements: { gold: 10, resources: {} }
};

describe("captured AFC modules unlock builds", () => {
  it("counts an installed captured module as a build tech without research", () => {
    const tiles = new Map([["1,1", capturedAfc(["trade"])]]);
    expect(hasBuildTech({ techIds: [], me: "me", tiles }, "trade")).toBe(true);
    expect(hasBuildTech({ techIds: [], me: "me", tiles }, "masonry")).toBe(false);
  });

  it("shows the Manufactory row for a captured, unresearched tooling module", () => {
    const state: TileActionFilterState = {
      techIds: [], localhostDevAetherWall: false, me: "me", tiles: new Map([["1,1", capturedAfc(["trade"])]]), techCatalog: [tradeModule]
    };
    const action: TileActionDef = { id: "build_manufactory", label: "Build Manufactory" };
    expect(hideTechLockedTileAction(action, state, () => "trade")).toBe(false);
  });

  it("ignores modules on an AFC that is not settled or not active", () => {
    const frontier = { ...capturedAfc(["trade"]), ownershipState: "FRONTIER" as const };
    expect(hasBuildTech({ techIds: [], me: "me", tiles: new Map([["1,1", frontier]]) }, "trade")).toBe(false);
    const inactive = capturedAfc(["trade"]);
    inactive.afc!.status = "inactive";
    expect(hasBuildTech({ techIds: [], me: "me", tiles: new Map([["1,1", inactive]]) }, "trade")).toBe(false);
  });

  it("recomputes the cached set when tilesRevision moves", () => {
    const tile = capturedAfc([]);
    const state = { me: "me", tiles: new Map([["1,1", tile]]), tilesRevision: 1 };
    expect(installedAfcModuleIds(state).has("trade")).toBe(false);
    tile.afc!.modules = ["trade"];
    state.tilesRevision = 2;
    expect(installedAfcModuleIds(state).has("trade")).toBe(true);
  });

  // Regression (review): combat-result tile writes don't bump tilesRevision, so a lost AFC stayed cached.
  it("drops a cached AFC that was lost without a tilesRevision bump", () => {
    const tile = capturedAfc(["trade"]);
    const state = { me: "me", tiles: new Map([["1,1", tile]]), tilesRevision: 7 };
    expect(installedAfcModuleIds(state).has("trade")).toBe(true);
    state.tiles.set("1,1", { ...tile, ownerId: "rival", ownershipState: "FRONTIER" });
    expect(installedAfcModuleIds(state).has("trade")).toBe(false);
  });

  it("ignores an AFC whose afc.ownerId is someone else (server mirror)", () => {
    const tile = capturedAfc(["trade"]);
    tile.afc!.ownerId = "rival";
    expect(hasBuildTech({ techIds: [], me: "me", tiles: new Map([["1,1", tile]]) }, "trade")).toBe(false);
  });

  // Regression (review): a captured, unresearched terrain module unhid the Create Mountain ability row.
  it("keeps ability rows hidden when their module is captured but not researched", () => {
    const state: TileActionFilterState = {
      techIds: [], localhostDevAetherWall: false, me: "me", tiles: new Map([["1,1", capturedAfc(["terrain-engineering"])]])
    };
    const action = { id: "create_mountain", label: "Create Mountain" } as TileActionDef;
    expect(hideTechLockedTileAction(action, state, () => "terrain-engineering")).toBe(true);
  });
});

