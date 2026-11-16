import { describe, expect, it } from "vitest";
import { tileActionMenuHtml } from "../client-tile-menu-html.js";
import { splitTileActionsIntoTabs } from "./client-tile-action-support.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";

const techEntry = (id: string, name: string, manifestCategory: "AFC_MODULE" | "CREW_OFFICE_CONSIGNMENT") => ({
  id, name, branch: "economy", tier: 1, manifestCategory, description: "", mods: {}, effects: {}, requirements: { gold: 10, resources: {} }
});
const buildingsHtml = (actions: TileActionDef[], state: Parameters<typeof splitTileActionsIntoTabs>[1]): { tabs: ReturnType<typeof splitTileActionsIntoTabs>; html: string } => {
  const tabs = splitTileActionsIntoTabs(actions, state);
  const view: TileMenuView = { title: "Deposit", subtitle: "", tabs: ["buildings"], overviewLines: [], ...tabs };
  return { tabs, html: tileActionMenuHtml(view, "buildings") };
};

describe("tech-locked resource builds in the tile menu", () => {
  // Regression: with an AFC-module tech researched but not installed on an
  // active AFC, tapping its deposit showed no build and no reason why
  // (first seen with the Umbrite Rig, since removed).
  it("shows Reclamation Works with an install hint when its module isn't on an active AFC", () => {
    const afc: Tile = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active", modules: [] } };
    const state = {
      techIds: ["trade"], localhostDevAetherWall: false, me: "me", tiles: new Map([["1,1", afc]]),
      techCatalog: [techEntry("trade", "Industrial Tooling Module", "AFC_MODULE")]
    };
    const { tabs, html } = buildingsHtml([{ id: "build_reclamation_works", label: "Build Reclamation Works" }], state);
    expect(tabs.buildings.map((row) => row.id)).toEqual(["build_reclamation_works"]);
    expect(html).toContain("Build Reclamation Works");
    expect(html).toContain("Install Industrial Tooling Module on an active AFC");
  });

  it("shows a locked Hydrogarden with a link to the Manifest that unlocks it", () => {
    const state = { techIds: [], localhostDevAetherWall: false, techCatalog: [techEntry("agriculture", "Hyperfeed Seedstock Consignment", "CREW_OFFICE_CONSIGNMENT")] };
    const lockedMine: TileActionDef = { id: "build_hydrogarden", label: "Build Hydrogarden", disabled: true, disabledReason: "Requires Hyperfeed Seedstock Consignment" };
    const { tabs, html } = buildingsHtml([lockedMine], state);
    expect(tabs.buildings).toEqual([{ ...lockedMine, techLinkId: "agriculture" }]);
    expect(html).toContain("Requires Hyperfeed Seedstock Consignment");
    expect(html).toContain('data-view-tech="agriculture"');
  });
});
