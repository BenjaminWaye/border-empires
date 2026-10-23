import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/client-styles.js";
import { tileActionMenuHtml } from "@client/client-tile-menu-html.js";
import type { Tile, TileMenuView } from "@client/client-types.js";
import { realBuildingMenuView } from "./tile-menu/real-building-menu-view.js";

/**
 * Every building row here (label, detail text, cost, disabled reason) comes
 * from the shipped client code: menuActionsForSingleTile + the real detail
 * and cost text + splitTileActionsIntoTabs. Only the game state around it is
 * faked (a fully-teched player with plenty of resources). The category
 * squares are the proposal; the rows underneath are not hand-written.
 */
const town = { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: { populationTier: "CITY" } } as unknown as Tile;

const greatCity = { ...town, x: 20, y: 20, town: { populationTier: "GREAT_CITY" } } as unknown as Tile;
const greatCitySupportTile = { x: 21, y: 20, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as unknown as Tile;
const supportTile = { x: 11, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as unknown as Tile;
const plainSettledTile = { x: 40, y: 40, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as unknown as Tile;
const farmTile = { x: 50, y: 12, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM" } as unknown as Tile;
const dockTile = { x: 60, y: 30, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", dockId: "dock-1" } as unknown as Tile;

const columns: { label: string; description: string; view: TileMenuView }[] = [
  {
    label: "Support tile next to a City",
    description: "Everything buildable on a town's support ring, plus the any-settled-tile structures.",
    view: realBuildingMenuView({ tile: supportTile, supportedTowns: [town] }, "Support tile (11, 10)", "Settled")
  },
  {
    label: "Support tile next to a Great City",
    description: "Monument components unlock in a Great City (a plain City shows them locked).",
    view: realBuildingMenuView({ tile: greatCitySupportTile, supportedTowns: [greatCity] }, "Support tile (21, 20)", "Settled")
  },
  {
    label: "Great City, monument techs not researched",
    description: "No monument tech researched, so the client lists no monument actions and the Monuments square is omitted.",
    view: realBuildingMenuView({ tile: greatCitySupportTile, supportedTowns: [greatCity], monumentTechsResearched: false }, "Support tile (21, 20)", "Settled")
  },
  {
    label: "Plain settled land",
    description: "No town nearby: Town Support is grayed out with the reason.",
    view: realBuildingMenuView({ tile: plainSettledTile }, "Settled land (40, 40)", "Settled")
  },
  {
    label: "Farm resource tile",
    description: "A resource tile: Resource is available alongside the generic structures.",
    view: realBuildingMenuView({ tile: farmTile }, "Farm (50, 12)", "Settled")
  },
  {
    label: "Dock tile",
    description: "A dock tile.",
    view: realBuildingMenuView({ tile: dockTile }, "Dock (60, 30)", "Settled")
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
    heading.style.cssText = "margin:0;color:#ffd166;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em";
    heading.textContent = col.label;
    colEl.appendChild(heading);

    const desc = document.createElement("p");
    desc.style.cssText = "margin:0 0 4px 0;color:rgba(201,216,236,0.72);font-size:12px;line-height:1.5";
    desc.textContent = col.description;
    colEl.appendChild(desc);

    const menuWrap = document.createElement("div");
    menuWrap.style.cssText = "position:relative;width:340px;max-height:640px;overflow:auto";
    menuWrap.innerHTML = tileActionMenuHtml(col.view, "buildings", false);
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

export const RealBuildMenu: StoryObj = {};
