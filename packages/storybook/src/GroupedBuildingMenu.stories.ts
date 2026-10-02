import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/style.css";
import "@client/client-tile-menu-building-group-style.css";
import { tileActionMenuHtml } from "@client/client-tile-menu-html.js";
import type { TileActionDef, TileMenuView } from "@client/client-types.js";

/**
 * Renders the *real* implementation (client-tile-menu-html.ts) to demo a
 * proposed fix: a developed settled tile can offer 15-30+ building actions
 * in one flat scrolling .tile-action-list. This groups the same buildings
 * tab data under four category squares -- Military, Resource, Town Support,
 * Infrastructure -- classified in client-tile-menu-building-category.ts
 * (NOT the shared sortGroup field, which is a sort-priority tier that mixes
 * weapons factories into its "support" bucket and vision structures like
 * Relay Beacon into its "military" bucket -- see that file's header comment
 * for the real classification rules: resourceTypes for Resource,
 * placementMode for Town Support, a curated set for Military).
 */
const buildingAction = (id: TileActionDef["id"], label: string, cost: string): TileActionDef => ({
  id,
  label,
  cost
});

const manyBuildings: TileActionDef[] = [
  buildingAction("build_relay_beacon", "Relay Beacon", "80 manpower"),
  buildingAction("build_rail_depot", "Rail Depot", "220 manpower"),
  buildingAction("build_caravanary", "Caravanary", "140 manpower"),
  buildingAction("build_customs_house", "Customs House", "260 manpower"),
  buildingAction("build_farmstead", "Farmstead", "60 manpower"),
  buildingAction("build_granary", "Granary", "180 manpower"),
  buildingAction("build_mine", "Mine", "150 manpower"),
  buildingAction("build_mintworks", "Mintworks", "300 manpower"),
  buildingAction("build_census_hall", "Census Hall", "220 manpower"),
  buildingAction("build_clearing_house", "Clearing House", "260 manpower"),
  buildingAction("build_foundry", "Foundry", "280 manpower"),
  buildingAction("build_umbrite_rig", "Umbrite Rig", "200 manpower"),
  buildingAction("build_umbrite_synthesizer", "Umbrite Synthesizer", "400 manpower"),
  buildingAction("build_titanium_works", "Titanium Works", "380 manpower"),
  buildingAction("build_crystal_synthesizer", "Crystal Synthesizer", "420 manpower"),
  buildingAction("build_waterworks", "Waterworks", "180 manpower"),
  buildingAction("build_observatory", "Observatory", "80 manpower"),
  buildingAction("build_radar_system", "Radar System", "240 manpower"),
  buildingAction("build_airport", "Airport", "500 manpower"),
  buildingAction("build_aether_tower", "Aether Tower", "460 manpower"),
  buildingAction("build_fortification", "Fortification", "300 manpower"),
  buildingAction("build_wooden_fort", "Wooden Fort", "120 manpower"),
  buildingAction("build_siege_camp", "Siege Camp", "260 manpower"),
  buildingAction("build_garrison_hall", "Garrison Hall", "300 manpower"),
  buildingAction("build_titanium_weapons_factory", "Titanium Weapons Factory", "440 manpower"),
  buildingAction("build_umbrite_weapons_factory", "Umbrite Weapons Factory", "440 manpower"),
  buildingAction("build_governors_office", "Governor's Office", "260 manpower"),
  buildingAction("build_logistics_guild", "Logistics Guild", "300 manpower"),
  buildingAction("build_assembly_works", "Assembly Works", "360 manpower")
];

const fewBuildings: TileActionDef[] = manyBuildings.slice(0, 4);

// A frontier outpost tile: only Military and Resource structures make
// sense here (no town ring for Town Support, no city offices for
// Infrastructure) -- demonstrates the empty-category gray-out + reason.
const frontierOutpostBuildings: TileActionDef[] = [
  buildingAction("build_wooden_fort", "Wooden Fort", "120 manpower"),
  buildingAction("build_siege_camp", "Siege Camp", "260 manpower"),
  buildingAction("build_farmstead", "Farmstead", "60 manpower"),
  buildingAction("build_mine", "Mine", "150 manpower"),
  buildingAction("build_umbrite_rig", "Umbrite Rig", "200 manpower"),
  buildingAction("build_relay_beacon", "Relay Beacon", "30 manpower"),
  buildingAction("build_observatory", "Observatory", "80 manpower")
];

const viewFor = (buildings: TileActionDef[]): TileMenuView => ({
  title: "Ironhold City (118, 64)",
  subtitle: "Great City · Settled",
  tabs: ["overview", "actions", "buildings"],
  overviewLines: [],
  actions: [],
  buildings,
  crystal: []
});

const columns: { label: string; description: string; view: TileMenuView; tab: "buildings" | "actions" }[] = [
  {
    label: "Before — flat list (unaffected, few buildings)",
    description: "6 or fewer building options still render as a single flat list — no grouping overhead for simple tiles.",
    view: viewFor(fewBuildings),
    tab: "buildings"
  },
  {
    label: "Before — flat list (many buildings)",
    description: `${manyBuildings.length} building options in one .tile-action-list, exactly what a developed capital city offers today. Scrolling to find one specific building is slow. (Rendered via the "actions" tab here only to bypass the new grouping and show the old behavior for comparison.)`,
    view: { ...viewFor([]), actions: manyBuildings },
    tab: "actions"
  },
  {
    label: "After — category squares",
    description:
      "Same data, grouped under 4 category squares: Military, Resource, Town Support, Infrastructure. Click a square to filter the list below it (pure CSS radio toggle). Threshold is 6 buildings before this kicks in.",
    view: viewFor(manyBuildings),
    tab: "buildings"
  },
  {
    label: "After — empty category grayed out",
    description:
      "Frontier outpost tile: only Military and Resource structures are buildable here. Town Support and Infrastructure squares are disabled with a tooltip explaining why (hover to see it), and the panel below shows the same reason.",
    view: viewFor(frontierOutpostBuildings),
    tab: "buildings"
  }
];

const render = (): HTMLElement => {
  const container = document.createElement("div");
  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "repeat(auto-fit, minmax(300px, 340px))";
  row.style.gap = "22px";
  row.style.padding = "28px";
  row.style.fontFamily = "system-ui, sans-serif";

  for (const col of columns) {
    const colEl = document.createElement("div");
    colEl.style.display = "grid";
    colEl.style.gap = "10px";
    colEl.style.alignContent = "start";

    const heading = document.createElement("h3");
    heading.style.margin = "0";
    heading.style.color = "#ffd166";
    heading.style.fontSize = "13px";
    heading.style.fontWeight = "800";
    heading.style.textTransform = "uppercase";
    heading.style.letterSpacing = "0.06em";
    heading.textContent = col.label;
    colEl.appendChild(heading);

    const desc = document.createElement("p");
    desc.style.margin = "0 0 4px 0";
    desc.style.color = "rgba(201, 216, 236, 0.72)";
    desc.style.fontSize = "12px";
    desc.style.lineHeight = "1.5";
    desc.textContent = col.description;
    colEl.appendChild(desc);

    const menuWrap = document.createElement("div");
    menuWrap.style.position = "relative";
    menuWrap.style.width = "340px";
    menuWrap.style.maxHeight = "560px";
    menuWrap.style.overflow = "auto";
    menuWrap.innerHTML = tileActionMenuHtml(col.view, col.tab, false);
    colEl.appendChild(menuWrap);

    row.appendChild(colEl);
  }

  container.appendChild(row);
  return container;
};

const meta: Meta = {
  title: "Tile Menu/Grouped Building Menu (proposal)",
  render
};
export default meta;

export const Comparison: StoryObj = {};
