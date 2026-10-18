import { describe, expect, it } from "vitest";
import { tileActionMenuHtml } from "../client-tile-menu-html.js";
import { splitTileActionsIntoTabs } from "./client-tile-action-support.js";
import type { TileActionDef, TileMenuView } from "../client-types.js";

// Regression: tapping an Umbrite deposit before researching the rig's tech
// used to show no Umbrite Rig at all, leaving no hint of which tech unlocks it.
describe("tech-locked Umbrite Rig in the tile menu", () => {
  const state = {
    techIds: [],
    localhostDevAetherWall: false,
    techCatalog: [{
      id: "leatherworking", name: "Umbrite Rigging Module", branch: "war", tier: 1,
      manifestCategory: "AFC_MODULE" as const, description: "", mods: {},
      effects: { unlockUmbriteRig: true }, requirements: { gold: 10, resources: {} }
    }]
  };
  const lockedRig: TileActionDef = {
    id: "build_umbrite_rig",
    label: "Build Umbrite Rig",
    disabled: true,
    disabledReason: "Requires Umbrite Rigging Module"
  };

  it("lists the rig on the Buildings tab with a link to its tech", () => {
    const tabs = splitTileActionsIntoTabs([lockedRig], state);
    expect(tabs.buildings).toEqual([{ ...lockedRig, techLinkId: "leatherworking" }]);

    const view: TileMenuView = { title: "Umbrite", subtitle: "", tabs: ["buildings"], overviewLines: [], ...tabs };
    const html = tileActionMenuHtml(view, "buildings", false);
    expect(html).toContain("Build Umbrite Rig");
    expect(html).toContain("Requires Umbrite Rigging Module");
    expect(html).toContain('data-view-tech="leatherworking"');
  });
});
