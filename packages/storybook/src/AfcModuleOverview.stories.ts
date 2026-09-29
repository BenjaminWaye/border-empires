import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/style.css";
import "@client/client-steampunk-theme-style.css";
import "@client/client-steampunk-tile-menu-style.css";
import { menuOverviewForTile } from "@client/client-tile-menu-view/client-tile-menu-view.js";
import type { Tile } from "@client/client-types.js";
import type { TechInfo } from "@client/client-tech-info-types.js";

// A representative slice of the real AFC-Module tech catalog (tech-tree.json),
// one from each Manifest branch plus a couple extra per branch so every
// heading in the grouped overview has something to show.
const tech = (id: string, name: string, branch: string): TechInfo => ({
  id,
  name,
  branch,
  tier: 1,
  description: "",
  mods: {},
  requirements: { gold: 0, resources: {} }
});

const TECH_CATALOG: TechInfo[] = [
  tech("workshops", "Umbrite Synthesis Module", "economy"),
  tech("alchemy", "Titanium Synthesis Module", "economy"),
  tech("conveyor-networks", "Reserve Lattice Module", "manpower"),
  tech("remade-concordat", "Ancillary Control Core", "manpower"),
  tech("masonry", "Titanium Forge Module", "war"),
  tech("leatherworking", "Rigging Works Module", "war"),
  tech("crystal-lattices", "Aether Resonance Core", "aether"),
  tech("matterwright-retort", "Matterwright Retort Module", "aether")
];

const deps = {
  state: { me: "me", techCatalog: TECH_CATALOG },
  prettyToken: (value: string) => value,
  terrainLabel: (_x: number, _y: number, terrain: Tile["terrain"]) => terrain,
  displayTownGoldPerMinute: () => 0,
  populationPerMinuteLabel: () => "0/m",
  townNextGrowthEtaLabel: () => "never",
  supportedOwnedTownsForTile: () => [] as Tile[],
  connectedDockCountForTile: () => 0,
  hostileObservatoryProtectingTile: () => undefined,
  constructionCountdownLineForTile: () => "",
  tileHistoryLines: () => [] as string[],
  isTileOwnedByAlly: () => false,
  areaEffectModifiersForTile: () => [],
  townPartialLoadingStartedAt: () => Date.now(),
  structureInfoButtonHtml: (type: string, label?: string) => `<button type="button" class="tile-overview-structure-link">${label ?? type}</button>`
};

type VariantName = "Fully staffed" | "Single module" | "Freshly commissioned" | "Captured (dormant)";

const VARIANTS: Record<VariantName, NonNullable<Tile["afc"]>> = {
  "Fully staffed": {
    ownerId: "me",
    status: "active",
    modules: ["workshops", "alchemy", "conveyor-networks", "remade-concordat", "masonry", "leatherworking", "crystal-lattices", "matterwright-retort"]
  },
  "Single module": { ownerId: "me", status: "active", modules: ["masonry"] },
  "Freshly commissioned": { ownerId: "me", status: "active", modules: [] },
  "Captured (dormant)": { ownerId: "them", status: "inactive", modules: ["workshops", "masonry", "crystal-lattices"] }
};

// Same class-composition rule client-tile-menu-html.ts's tileMenuBodyHtml
// uses to turn TileOverviewLine[] into markup -- duplicated here (not
// imported, it isn't exported) rather than re-deriving the panel's own
// look, matching the same-file precedent in TownTerrainOverview.stories.ts.
const overviewCardHtml = (tile: Tile): string => `
  <div class="tile-overview-card">
    ${menuOverviewForTile(tile, deps)
      .map(
        (line) =>
          `<div class="tile-overview-line${line.kind === "effect" ? " tile-overview-line-effect" : ""}${line.kind === "section" ? " tile-overview-line-section" : ""}${line.kind === "loading" ? " tile-overview-line-loading" : ""}${line.kind === "group" ? " tile-overview-line-group" : ""}${line.kind === "statgrid" ? " tile-overview-line-statgrid" : ""}${line.nested ? " tile-overview-line-nested" : ""}">${line.html}</div>`
      )
      .join("")}
  </div>
`;

const render = (_args: unknown, context: { loaded?: Record<string, unknown> }): HTMLElement => {
  const root = document.createElement("main");
  root.style.cssText = "min-height:100vh;padding:28px;background:radial-gradient(circle at 50% 0,#322414,#100c07 55%,#080604);font-family:var(--sp-font-body,serif);";

  const heading = document.createElement("header");
  heading.style.cssText = "max-width:520px;margin:0 auto 22px;color:var(--sp-parchment-300,#d9c9aa);";
  heading.innerHTML =
    '<div style="color:var(--sp-brass-300,#d9ad52);font:700 11px var(--sp-font-display,serif);letter-spacing:.12em;text-transform:uppercase">Tile Overview</div>' +
    '<h1 style="margin:5px 0 7px;color:var(--sp-brass-100,#f4dfa6);font:700 24px var(--sp-font-display,serif)">AFC module list</h1>' +
    '<p style="margin:0;font-size:13px;line-height:1.5">Rendered by calling the real menuOverviewForTile() — not a copy. Docked modules group under Economy, Manpower, War, and Aether via TechInfo.branch; an inactive AFC shows a Dormant banner without hiding its modules.</p>';
  root.appendChild(heading);

  const variantName = (context as { args?: { variant?: VariantName } }).args?.variant ?? "Fully staffed";
  const afc = VARIANTS[variantName];
  const tile = { x: 214, y: 88, terrain: "LAND", ownerId: afc.ownerId, ownershipState: "SETTLED", afc } as Tile;

  const card = document.createElement("section");
  card.style.cssText = "max-width:420px;margin:0 auto;";
  card.innerHTML = `<div class="tile-action-head"><div class="tile-action-title">Automated Fabrication Complex (${tile.x}, ${tile.y})</div></div>${overviewCardHtml(tile)}`;
  root.appendChild(card);

  return root;
};

const meta: Meta<{ variant: VariantName }> = {
  title: "UI/AFC Module Overview",
  argTypes: {
    variant: {
      control: "select",
      options: Object.keys(VARIANTS)
    }
  },
  args: {
    variant: "Fully staffed"
  },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The AFC tile-overview panel added to menuOverviewForTile (docs/manifest-afc-tile-overview-plan.md): tapping an AFC now lists every commissioned module grouped under its Manifest branch, reusing the existing TileOverviewLine group/nested/dormant primitives rather than a bespoke component."
      }
    }
  },
  render
};

export default meta;
type Story = StoryObj<{ variant: VariantName }>;

export const FullyStaffed: Story = { args: { variant: "Fully staffed" } };
export const SingleModule: Story = { args: { variant: "Single module" } };
export const FreshlyCommissioned: Story = { args: { variant: "Freshly commissioned" } };
export const CapturedDormant: Story = { args: { variant: "Captured (dormant)" } };
