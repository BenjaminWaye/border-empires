import { describe, expect, it } from "vitest";
import { hideTechLockedTileAction, openTechDetailFromTileMenu, presentTechLockedTileAction, type TileActionFilterState } from "./client-tech-locked-tile-action.js";
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

describe("tech-locked resource builds", () => {
  const mineTech = {
    id: "mining", name: "Prospector Crew", branch: "economy", tier: 2,
    manifestCategory: "CREW_OFFICE_CONSIGNMENT" as const, description: "", mods: {},
    effects: { unlockMine: true }, requirements: { gold: 10, resources: {} }
  };
  const rigTech = {
    id: "leatherworking", name: "Umbrite Rigging Module", branch: "war", tier: 1,
    manifestCategory: "AFC_MODULE" as const, description: "", mods: {},
    effects: { unlockUmbriteRig: true }, requirements: { gold: 10, resources: {} }
  };
  // Titanium is revealed by masonry, so a Titanium tile is visible before the Mine's tech.
  const lockedMine: TileActionDef = { id: "build_mine", label: "Build Mine", disabled: true, disabledReason: "Requires Prospector Crew" };
  const unlockedState: TileActionFilterState = { techIds: [], localhostDevAetherWall: false, me: "me", tiles: new Map(), techCatalog: [mineTech] };

  it("keeps a locked Mine visible, names its tech, and links to it", () => {
    expect(presentTechLockedTileAction(lockedMine, unlockedState, () => "mining")).toMatchObject({
      disabled: true,
      disabledReason: "Requires Prospector Crew",
      techLinkId: "mining"
    });
  });

  it("keeps the logic layer's reason when the tech catalog hasn't loaded", () => {
    const state: TileActionFilterState = { techIds: [], localhostDevAetherWall: false };
    expect(presentTechLockedTileAction(lockedMine, state, () => "mining")?.disabledReason).toBe("Requires Prospector Crew");
  });

  it("stays hidden when the tile already has a structure", () => {
    const blocked = { ...lockedMine, disabledReason: "Tile already has structure" };
    expect(presentTechLockedTileAction(blocked, unlockedState, () => "mining")).toBeUndefined();
  });

  it("says to install a researched module that is not on an active AFC", () => {
    const afc: Tile = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active", modules: [] } };
    const state: TileActionFilterState = { techIds: ["leatherworking"], localhostDevAetherWall: false, me: "me", tiles: new Map([["1,1", afc]]), techCatalog: [rigTech] };
    const rig: TileActionDef = { id: "build_umbrite_rig", label: "Build Umbrite Rig" };
    const shown = presentTechLockedTileAction(rig, state, () => "leatherworking");
    expect(shown).toMatchObject({ disabled: true, disabledReason: "Install Umbrite Rigging Module on an active AFC" });
    expect(shown?.techLinkId).toBeUndefined();
    // Installing wouldn't be enough when something else (here, no free slot) also blocks it.
    expect(presentTechLockedTileAction({ ...rig, disabled: true, disabledReason: "No free UMBRITE slot" }, state, () => "leatherworking")).toBeUndefined();
    afc.afc = { ownerId: "me", status: "active", modules: ["leatherworking"] };
    expect(presentTechLockedTileAction(rig, state, () => "leatherworking")).toBe(rig);
  });

  it("still hides tech-locked builds that are not same-tile resource builds", () => {
    const state: TileActionFilterState = { techIds: [], localhostDevAetherWall: false };
    expect(presentTechLockedTileAction({ id: "build_manufactory", label: "Build Manufactory", disabled: true, disabledReason: "Requires Industrial Tooling Module" }, state, () => "trade")).toBeUndefined();
  });

  it("opens the Manifest on the linked tech", () => {
    const state = { activePanel: null, mobilePanel: "core", techUiSelectedId: "", techDetailOpen: false, domainDetailOpen: true } as Parameters<typeof openTechDetailFromTileMenu>[0];
    openTechDetailFromTileMenu(state, "mining", true);
    expect(state).toMatchObject({ activePanel: "tech", mobilePanel: "tech", techUiSelectedId: "mining", techDetailOpen: true, domainDetailOpen: false });
  });
});
