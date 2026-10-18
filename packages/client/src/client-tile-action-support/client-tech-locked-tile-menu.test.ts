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
  return { tabs, html: tileActionMenuHtml(view, "buildings", false) };
};

describe("tech-locked resource builds in the tile menu", () => {
  // Regression: with Umbrite Rigging Module researched (which is what reveals
  // Umbrite on the map) but not installed on an active AFC, tapping an Umbrite
  // deposit showed no Umbrite Rig and no reason why.
  it("shows the Umbrite Rig with an install hint when its module isn't on an active AFC", () => {
    const afc: Tile = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active", modules: [] } };
    const state = {
      techIds: ["leatherworking"], localhostDevAetherWall: false, me: "me", tiles: new Map([["1,1", afc]]),
      techCatalog: [techEntry("leatherworking", "Umbrite Rigging Module", "AFC_MODULE")]
    };
    const { tabs, html } = buildingsHtml([{ id: "build_umbrite_rig", label: "Build Umbrite Rig" }], state);
    expect(tabs.buildings.map((row) => row.id)).toEqual(["build_umbrite_rig"]);
    expect(html).toContain("Build Umbrite Rig");
    expect(html).toContain("Install Umbrite Rigging Module on an active AFC");
  });

  it("shows a locked Mine with a link to the Manifest that unlocks it", () => {
    const state = { techIds: ["masonry"], localhostDevAetherWall: false, techCatalog: [techEntry("mining", "Prospector Crew", "CREW_OFFICE_CONSIGNMENT")] };
    const lockedMine: TileActionDef = { id: "build_mine", label: "Build Mine", disabled: true, disabledReason: "Requires Prospector Crew" };
    const { tabs, html } = buildingsHtml([lockedMine], state);
    expect(tabs.buildings).toEqual([{ ...lockedMine, techLinkId: "mining" }]);
    expect(html).toContain("Requires Prospector Crew");
    expect(html).toContain('data-view-tech="mining"');
  });
});
