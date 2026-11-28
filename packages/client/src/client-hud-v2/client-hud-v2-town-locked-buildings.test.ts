// Owner, First-15 round 1: the town screen hid every building whose research was missing, so a new player saw
// only Fortify and Relay Beacon and never learned what a town could grow into. Locked buildings now show greyed,
// naming the research that unlocks them, with a link to it in the Manifest.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { splitTileActionsIntoTabs } from "../client-tile-action-support/client-tile-action-support.js";
import { techLockedBuildingRow } from "../client-tile-action-support/client-tech-locked-tile-action.js";
import { requiredTechForTileAction } from "../client-tile-action-support/client-build-action-dispatch.js";
import { townScreenRegions } from "./client-hud-v2-town.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";

const tech = (id: string, name: string) => ({
  id, name, branch: "economy", tier: 1, manifestCategory: "CREW_OFFICE_CONSIGNMENT" as const, description: "", mods: {}, effects: {}, requirements: { gold: 10, resources: {} }
});
const state = { techIds: [] as string[], localhostDevAetherWall: false, techCatalog: [tech("trade", "Industrial Tooling Module"), tech("pottery", "Kiln Craft")] };
const manufactory: TileActionDef = { id: "build_manufactory", label: "Build Manufactory", detail: "More town coin", disabled: true, disabledReason: "Requires Industrial Tooling Module" };
const incubation: TileActionDef = { id: "build_incubation_engine", label: "Build Incubation Engine", disabled: true, disabledReason: "Requires Kiln Craft" };
const beacon: TileActionDef = { id: "build_relay_beacon" as TileActionDef["id"], label: "Build Relay Beacon", cost: "70 m.p." };

const town = { x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: { name: "T", type: "FARMING", populationTier: "TOWN" } } as Tile;
const viewOf = (tabs: ReturnType<typeof splitTileActionsIntoTabs>): TileMenuView =>
  ({ title: "T", subtitle: "", tabs: ["buildings"], overviewLines: [], ...tabs }) as TileMenuView;
const buildRegion = (focusView: TileMenuView, buildSelection?: string, category?: "town_support"): string =>
  townScreenRegions({ town, focus: town, townView: focusView, focusView, townIndex: 0, townCount: 1, buildSelection, category }).build;

describe("town screen: buildings locked by research", () => {
  it("keeps research-locked buildings out of the tile menu's list but hands them to the town screen", () => {
    const tabs = splitTileActionsIntoTabs([beacon, manufactory, incubation], state);
    expect(tabs.buildings.map((b) => b.id)).toEqual(["build_relay_beacon"]);
    expect(tabs.lockedBuildings?.map((b) => [b.id, b.disabledReason, b.techLinkId])).toEqual([
      ["build_manufactory", "Requires Industrial Tooling Module", "trade"],
      ["build_incubation_engine", "Requires Kiln Craft", "pottery"]
    ]);
  });

  it("lists every locked building greyed, with the research that unlocks it as a link", () => {
    const html = buildRegion(viewOf(splitTileActionsIntoTabs([beacon, manufactory, incubation], state)), undefined, "town_support");
    expect(html).toContain("Build Manufactory");
    expect(html).toContain("Build Incubation Engine");
    expect(html.match(/class="v2t-build-item v2t-build-item-locked"/g)).toHaveLength(2);
    expect(html).toContain('class="v2t-build-tech" data-view-tech="trade" title="Open in the Manifest">Requires Industrial Tooling Module →</button>');
    expect(html).toContain('data-view-tech="pottery"');
    expect(html).toMatch(/class="v2t-build v2t-build-off v2t-build-locked" data-v2-build-pick="build_manufactory"/);
  });

  it("offers no Place for a locked building", () => {
    const html = buildRegion(viewOf(splitTileActionsIntoTabs([beacon, manufactory], state)), "build_manufactory", "town_support");
    expect(html).not.toContain('data-hud-v2-action="build_manufactory"');
  });

  it("opens on a tab with something buildable now, not on a tab of locked buildings", () => {
    const html = buildRegion(viewOf(splitTileActionsIntoTabs([beacon, manufactory], state)));
    expect(html).toContain('data-v2-build-pick="build_relay_beacon"');
    expect(html).not.toContain('data-v2-build-pick="build_manufactory"');
  });

  it("drops a locked building once it is researched, the row then shows as usual", () => {
    const researched = { ...state, techIds: ["trade"] };
    const tabs = splitTileActionsIntoTabs([{ ...manufactory, disabled: false, disabledReason: undefined, cost: "1,200 coin" } as TileActionDef], researched);
    expect(tabs.buildings.map((b) => b.id)).toEqual(["build_manufactory"]);
    expect(tabs.lockedBuildings).toBeUndefined();
  });

  it("leaves out a locked building that something other than research blocks", () => {
    const taken = { ...manufactory, disabledReason: "Tile already has structure" };
    expect(techLockedBuildingRow(taken, state, requiredTechForTileAction)).toBeUndefined();
  });

  it("keeps the Build plots card's text wrapping inside its cell rather than cut short", () => {
    const css = readFileSync(new URL("./client-hud-v2-town-battle.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.v2t-plots \{ min-width: 0; overflow-wrap: anywhere; \}/);
    expect(css).not.toMatch(/\.v2t-plot-key \{[^}]*nowrap/);
  });
});
