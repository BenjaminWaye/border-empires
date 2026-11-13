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
    id: "agriculture", name: "Hyperfeed Seedstock Consignment", branch: "economy", tier: 1,
    manifestCategory: "CREW_OFFICE_CONSIGNMENT" as const, description: "", mods: {},
    effects: { unlockHydrogarden: true }, requirements: { gold: 10, resources: {} }
  };
  const rigTech = {
    id: "trade", name: "Industrial Tooling Module", branch: "economy", tier: 1,
    manifestCategory: "AFC_MODULE" as const, description: "", mods: {},
    effects: { unlockReclamationWorks: true }, requirements: { gold: 10, resources: {} }
  };
    const lockedMine: TileActionDef = { id: "build_hydrogarden", label: "Build Hydrogarden", disabled: true, disabledReason: "Requires Hyperfeed Seedstock Consignment" };
  const unlockedState: TileActionFilterState = { techIds: [], localhostDevAetherWall: false, me: "me", tiles: new Map(), techCatalog: [mineTech] };

  it("keeps a locked Hydrogarden visible, names its tech, and links to it", () => {
    expect(presentTechLockedTileAction(lockedMine, unlockedState, () => "agriculture")).toMatchObject({
      disabled: true,
      disabledReason: "Requires Hyperfeed Seedstock Consignment",
      techLinkId: "agriculture"
    });
  });

  it("keeps the logic layer's reason when the tech catalog hasn't loaded", () => {
    const state: TileActionFilterState = { techIds: [], localhostDevAetherWall: false };
    expect(presentTechLockedTileAction(lockedMine, state, () => "agriculture")?.disabledReason).toBe("Requires Hyperfeed Seedstock Consignment");
  });

  it("stays hidden when the tile already has a structure", () => {
    const blocked = { ...lockedMine, disabledReason: "Tile already has structure" };
    expect(presentTechLockedTileAction(blocked, unlockedState, () => "agriculture")).toBeUndefined();
  });

  it("says to install a researched module that is not on an active AFC", () => {
    const afc: Tile = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active", modules: [] } };
    const state: TileActionFilterState = { techIds: ["trade"], localhostDevAetherWall: false, me: "me", tiles: new Map([["1,1", afc]]), techCatalog: [rigTech] };
    const rig: TileActionDef = { id: "build_reclamation_works", label: "Build Reclamation Works" };
    const shown = presentTechLockedTileAction(rig, state, () => "trade");
    expect(shown).toMatchObject({ disabled: true, disabledReason: "Install Industrial Tooling Module on an active AFC" });
    expect(shown?.techLinkId).toBeUndefined();
    // Installing wouldn't be enough when something else (here, no free slot) also blocks it.
    expect(presentTechLockedTileAction({ ...rig, disabled: true, disabledReason: "No free FOOD slot" }, state, () => "trade")).toBeUndefined();
    afc.afc = { ownerId: "me", status: "active", modules: ["trade"] };
    expect(presentTechLockedTileAction(rig, state, () => "trade")).toBe(rig);
  });

  it("still hides tech-locked builds that are not same-tile resource builds", () => {
    const state: TileActionFilterState = { techIds: [], localhostDevAetherWall: false };
    expect(presentTechLockedTileAction({ id: "build_manufactory", label: "Build Manufactory", disabled: true, disabledReason: "Requires Industrial Tooling Module" }, state, () => "trade")).toBeUndefined();
  });

  it("opens the Manifest on the linked tech", () => {
    const state = { activePanel: null, techUiSelectedId: "", techDetailOpen: false, domainDetailOpen: true } as Parameters<typeof openTechDetailFromTileMenu>[0];
    openTechDetailFromTileMenu(state, "mining");
    expect(state).toMatchObject({ activePanel: "tech", techUiSelectedId: "mining", techDetailOpen: true, domainDetailOpen: false });
  });
});
