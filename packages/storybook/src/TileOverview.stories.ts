import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/style.css";
import "@client/client-town-stat-grid-style.css";
import "@client/client-steampunk-theme-style.css";
import "@client/client-steampunk-tile-menu-style.css";
import { menuOverviewForTile } from "@client/client-tile-menu-view/client-tile-menu-view.js";
import type { Tile } from "@client/client-types.js";

// Real menuOverviewForTile output (same code the game runs) for the tile
// situations the overview has to prioritise: what is special about the tile
// should be the first thing a player reads.

const ME = "me";
const town: NonNullable<Tile["town"]> = {
  name: "Rivergate", type: "MARKET", baseGoldPerMinute: 0.4, supportCurrent: 4, supportMax: 8, goldPerMinute: 0.5, cap: 0, isFed: true,
  population: 23_410, maxPopulation: 100_000, populationGrowthPerMinute: 7.47, populationTier: "TOWN", connectedTownCount: 1, connectedTownBonus: 0.1,
  hasMintworks: false, mintworksActive: false, hasGranary: false, granaryActive: false
};
const land = (over: Partial<Tile>): Tile => ({ x: 585, y: 270, terrain: "LAND", ...over }) as Tile;
const mine = { ownerId: ME } as const;

type Example = { label: string; note: string; tile: Tile; supportFor?: Tile };
const EXAMPLES: Example[] = [
  { label: "Waystation · dormant, unowned", note: "Waystation block leads; hint says how to activate", tile: land({ waystation: { activated: false } }) },
  { label: "Waystation · dormant, my frontier", note: "Waystation first, generic frontier text after", tile: land({ ...mine, ownershipState: "FRONTIER", waystation: { activated: false } }) },
  { label: "Waystation · active (Tech)", note: "Status, what it granted, who activated it", tile: land({ ...mine, ownershipState: "SETTLED", waystation: { activated: true, activatedByPlayerId: ME, grantedEffect: "TECH", grantedTechId: "IRON_FORGING" } }) },
  { label: "Waystation · active (Resource slot, other player)", note: "", tile: land({ ownerId: "rival", ownershipState: "SETTLED", waystation: { activated: true, activatedByPlayerId: "rival", grantedEffect: "RESOURCE_SLOT", grantedResource: "TITANIUM" } }) },
  { label: "Resource · my frontier", note: "Resource node is the lead", tile: land({ ...mine, ownershipState: "FRONTIER", resource: "TITANIUM" }) },
  { label: "Town · settled", note: "Town stat grid", tile: land({ ...mine, ownershipState: "SETTLED", town, yieldRate: { goldPerMinute: 0.5 } } as Partial<Tile>) },
  { label: "Town support tile", note: "Support-tile line for the town it feeds", tile: land({ ...mine, ownershipState: "SETTLED" }), supportFor: land({ x: 586, y: 270, ...mine, ownershipState: "SETTLED", town }) },
  { label: "Building on settled tile", note: "Built: leads", tile: land({ ...mine, ownershipState: "SETTLED", economicStructure: { ownerId: ME, type: "MINTWORKS", status: "active" } }) },
  { label: "Fort", note: "", tile: land({ ...mine, ownershipState: "SETTLED", fort: { ownerId: ME, status: "active", variant: "FORT" } }) },
  { label: "Siege outpost", note: "", tile: land({ ...mine, ownershipState: "SETTLED", siegeOutpost: { ownerId: ME, status: "active", variant: "SIEGE_OUTPOST" } }) },
  { label: "Natural wonder · my frontier", note: "Wonder leads", tile: land({ ...mine, ownershipState: "FRONTIER", naturalWonder: { type: "FOUNDRY_HEART" } }) },
  { label: "Plain land · unclaimed", note: "Nothing special: generic text only", tile: land({}) }
];

const stubDeps = (example: Example) => ({
  state: { me: ME },
  prettyToken: (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " "),
  terrainLabel: (_x: number, _y: number, terrain: Tile["terrain"]) => terrain,
  displayTownGoldPerMinute: () => 0.5,
  populationPerMinuteLabel: (v: number) => `+${v.toFixed(2)}/m`,
  townNextGrowthEtaLabel: () => "City in ~8d",
  supportedOwnedTownsForTile: () => (example.supportFor ? [example.supportFor] : []),
  connectedDockCountForTile: () => 0,
  hostileObservatoryProtectingTile: () => undefined,
  constructionCountdownLineForTile: () => "",
  tileHistoryLines: () => [] as string[],
  isTileOwnedByAlly: () => false,
  areaEffectModifiersForTile: () => [],
  townPartialLoadingStartedAt: () => Date.now(),
  structureInfoButtonHtml: (type: string, label?: string) => `<button type="button" class="structure-info-link">${label ?? type.replace(/_/g, " ")}</button>`
});

const kicker = (tile: Tile): string => (tile.ownershipState === "FRONTIER" ? "Frontier" : tile.ownershipState === "SETTLED" ? "Settled" : "");

const render = (): HTMLElement => {
  const root = document.createElement("main");
  root.style.cssText = "min-height:100vh;padding:28px;background:radial-gradient(circle at 50% 0,#322414,#100c07 55%,#080604);font-family:var(--sp-font-body,serif);";
  const grid = document.createElement("section");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,340px));justify-content:center;gap:22px;align-items:start;";
  for (const example of EXAMPLES) {
    const lines = menuOverviewForTile(example.tile, stubDeps(example));
    const body = lines
      .map((line) => `<div class="tile-overview-line${line.kind === "effect" ? " tile-overview-line-effect" : ""}${line.kind === "section" ? " tile-overview-line-section" : ""}${line.kind === "statgrid" ? " tile-overview-line-statgrid" : ""}${line.nested ? " tile-overview-line-nested" : ""}">${line.html}</div>`)
      .join("");
    const k = kicker(example.tile);
    const card = document.createElement("article");
    card.style.cssText = "display:grid;gap:8px;";
    card.innerHTML =
      `<div style="color:#d9ad52;font:700 11px var(--sp-font-display,serif);letter-spacing:.1em;text-transform:uppercase">${example.label}</div>` +
      (example.note ? `<div style="color:#b9a884;font-size:12px">${example.note}</div>` : "") +
      `<div class="tile-action-card" style="position:static"><div class="tile-action-head"><div class="tile-action-title">Tile ${example.tile.x},${example.tile.y}</div></div>` +
      `<div class="tile-overview-card">${k ? `<div class="tile-overview-kicker">${k}</div>` : ""}${body}</div></div>`;
    grid.appendChild(card);
  }
  root.appendChild(grid);
  return root;
};

const meta: Meta = {
  title: "UI/Tile Overview Cases",
  parameters: { layout: "fullscreen", docs: { description: { component: "The tile overview across the main tile situations, rendered with the real menuOverviewForTile." } } },
  render
};
export default meta;
export const AllCases: StoryObj = {};
