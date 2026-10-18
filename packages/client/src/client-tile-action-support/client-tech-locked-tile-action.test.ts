import { describe, expect, it } from "vitest";
import { hideTechLockedTileAction, type TileActionFilterState } from "./client-tech-locked-tile-action.js";
import type { Tile, TileActionDef } from "../client-types.js";

describe("Manufactory module build availability", () => {
  it("shows construction only after the purchased tooling module is installed", () => {
    const afc: Tile = {
      x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
      afc: { ownerId: "me", status: "active", modules: [] }
    };
    const state: TileActionFilterState = {
      techIds: ["trade"], localhostDevAetherWall: false, me: "me", tiles: new Map([["1,1", afc]]),
      techCatalog: [{
        id: "trade", name: "Industrial Tooling Module", branch: "economy", tier: 1,
        manifestCategory: "AFC_MODULE", description: "", mods: {},
        effects: { unlockManufactory: true }, requirements: { gold: 10, resources: {} }
      }]
    };
    const action: TileActionDef = { id: "build_manufactory", label: "Build Manufactory" };
    expect(hideTechLockedTileAction(action, state, () => "trade")).toBe(true);
    afc.afc = { ownerId: "me", status: "active", modules: ["trade"] };
    expect(hideTechLockedTileAction(action, state, () => "trade")).toBe(false);
    afc.afc.status = "inactive";
    expect(hideTechLockedTileAction(action, state, () => "trade")).toBe(true);
  });
});
