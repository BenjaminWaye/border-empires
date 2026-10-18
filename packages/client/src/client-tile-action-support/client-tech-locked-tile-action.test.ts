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
  const rigTech = {
    id: "leatherworking", name: "Umbrite Rigging Module", branch: "war", tier: 1,
    manifestCategory: "AFC_MODULE" as const, description: "", mods: {},
    effects: { unlockUmbriteRig: true }, requirements: { gold: 10, resources: {} }
  };
  const rig: TileActionDef = { id: "build_umbrite_rig", label: "Build Umbrite Rig", disabled: true, disabledReason: "Requires Umbrite Rigging Module" };

  it("keeps a locked Umbrite Rig visible, names its tech, and links to it", () => {
    const state: TileActionFilterState = { techIds: [], localhostDevAetherWall: false, me: "me", tiles: new Map(), techCatalog: [rigTech] };
    expect(presentTechLockedTileAction(rig, state, () => "leatherworking")).toMatchObject({
      disabled: true,
      disabledReason: "Requires Umbrite Rigging Module",
      techLinkId: "leatherworking"
    });
  });

  it("says to install the module once it is researched but not on an active AFC", () => {
    const afc: Tile = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active", modules: [] } };
    const state: TileActionFilterState = { techIds: ["leatherworking"], localhostDevAetherWall: false, me: "me", tiles: new Map([["1,1", afc]]), techCatalog: [rigTech] };
    const shown = presentTechLockedTileAction({ ...rig, disabled: false, disabledReason: "" }, state, () => "leatherworking");
    expect(shown).toMatchObject({ disabled: true, disabledReason: "Install Umbrite Rigging Module on an active AFC" });
    expect(shown?.techLinkId).toBeUndefined();
    afc.afc = { ownerId: "me", status: "active", modules: ["leatherworking"] };
    const unlocked = { ...rig, disabled: false, disabledReason: "" };
    expect(presentTechLockedTileAction(unlocked, state, () => "leatherworking")).toBe(unlocked);
  });

  it("still hides tech-locked builds that are not same-tile resource builds", () => {
    const state: TileActionFilterState = { techIds: [], localhostDevAetherWall: false };
    expect(presentTechLockedTileAction({ id: "build_manufactory", label: "Build Manufactory" }, state, () => "trade")).toBeUndefined();
  });

  it("opens the Manifest on the linked tech", () => {
    const state = { activePanel: null, mobilePanel: "core", techUiSelectedId: "", techDetailOpen: false, domainDetailOpen: true } as Parameters<typeof openTechDetailFromTileMenu>[0];
    openTechDetailFromTileMenu(state, "leatherworking", true);
    expect(state).toMatchObject({ activePanel: "tech", mobilePanel: "tech", techUiSelectedId: "leatherworking", techDetailOpen: true, domainDetailOpen: false });
  });
});
