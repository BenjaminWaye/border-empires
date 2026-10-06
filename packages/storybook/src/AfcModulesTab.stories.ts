import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/style.css";
import "@client/client-steampunk-theme-style.css";
import "@client/client-steampunk-tile-menu-style.css";
import "@client/client-afc-module-bays/client-afc-module-bays.css";
import { afcModuleBaysHtml } from "@client/client-afc-module-bays/client-afc-module-bays-html.js";
import { afcModuleBaysView } from "@client/client-afc-module-bays/client-afc-module-bays-model.js";
import { bindAfcModuleBays } from "@client/client-afc-module-bays/client-afc-module-bays-bind.js";
import type { Tile } from "@client/client-types.js";
import type { TechInfo } from "@client/client-tech-info-types.js";

// A slice of the real AFC-Module catalog (tech-tree.json), with its real
// names, branches and descriptions.
const tech = (id: string, name: string, branch: string, description: string): TechInfo => ({
  id,
  name,
  branch,
  tier: 1,
  description,
  mods: {},
  requirements: { gold: 0, resources: {} },
  manifestCategory: "AFC_MODULE"
});

const TECH_CATALOG: TechInfo[] = [
  tech("workshops", "Umbrite Synthesis Module", "economy", "AFC module: precision tension frames and calibration jigs for this world's umbrite. Unlocks Umbrite Works."),
  tech("alchemy", "Titanium Synthesis Module", "economy", "AFC module: assay standards, furnace salts, and production apparatus that make this planet's titanium usable."),
  tech("conveyor-networks", "Reserve Lattice Module", "manpower", "AFC module: the assembly machinery behind the House's largest manpower reserve."),
  tech("remade-concordat", "Ancillary Control Core", "manpower", "AFC module: the sealed neural-control and command apparatus for ancillaries."),
  tech("masonry", "Titanium Forge Module", "war", "AFC module: a heavy plate-forging system delivered from offworld. Reveals Titanium and unlocks Fort."),
  tech("muster-discipline", "Hive Mind Module I", "war", "AFC module: the first offworld half-mind. Adds one Muster tile."),
  tech("crystal-lattices", "Aether Resonance Core", "aether", "AFC module: the core apparatus that lets House aether-casters work this planet's crystal lattice."),
  tech("radar", "Resonance Grid Module", "aether", "AFC module: sensor apparatus tuned to this planet's aether interference.")
];

type VariantName = "Full (8/8)" | "Mixed" | "Freshly commissioned" | "Someone else's (dormant)";

const NOW = 1_000_000;
const VARIANTS: Record<VariantName, NonNullable<Tile["afc"]>> = {
  "Full (8/8)": {
    ownerId: "me",
    status: "active",
    modules: TECH_CATALOG.map((t) => t.id),
    houseModules: TECH_CATALOG.map((t) => t.id)
  },
  Mixed: {
    ownerId: "me",
    status: "active",
    modules: ["masonry", "workshops", "crystal-lattices"],
    houseModules: ["masonry", "crystal-lattices"],
    incomingModules: [{ techId: "radar", arrivesAt: NOW + 42_000 }]
  },
  "Freshly commissioned": { ownerId: "me", status: "active", modules: [] },
  "Someone else's (dormant)": { ownerId: "them", status: "inactive", modules: ["workshops", "masonry", "crystal-lattices"] }
};

const render = (args: { variant: VariantName }): HTMLElement => {
  const root = document.createElement("main");
  root.style.cssText = "min-height:100vh;padding:28px;background:radial-gradient(circle at 50% 0,#322414,#100c07 55%,#080604);font-family:var(--sp-font-body,serif);";
  const afc = VARIANTS[args.variant];
  const tile = { x: 214, y: 88, terrain: "LAND", ownerId: afc.ownerId, ownershipState: "SETTLED", afc } as Tile;
  const view = afcModuleBaysView(
    { me: "me", techIds: TECH_CATALOG.map((t) => t.id), techCatalog: TECH_CATALOG, tiles: new Map([["214,88", tile]]) },
    tile,
    NOW
  );
  const card = document.createElement("section");
  card.className = "tile-action-card";
  card.style.cssText = "position:relative;max-width:348px;margin:0 auto;padding:12px;";
  card.innerHTML = `<div class="tile-action-head"><div class="tile-action-title">Automated Fabrication Complex (${tile.x}, ${tile.y})</div></div><div class="tile-menu-body">${afcModuleBaysHtml(view)}</div>`;
  bindAfcModuleBays(card, "214,88");
  root.appendChild(card);
  return root;
};

const meta: Meta<{ variant: VariantName }> = {
  title: "UI/AFC Modules Tab",
  argTypes: { variant: { control: "select", options: Object.keys(VARIANTS) } },
  args: { variant: "Mixed" },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The AFC Modules tile-menu tab (docs/manifest-afc-module-bays-plan.md), rendered with the real view model, HTML and bay binding. Eight bays on the ring at the same angles as the 3D sockets; tap a module for what it does, or an empty bay for its Call down list."
      }
    }
  },
  render
};

export default meta;
type Story = StoryObj<{ variant: VariantName }>;

export const Full: Story = { args: { variant: "Full (8/8)" } };
export const Mixed: Story = { args: { variant: "Mixed" } };
export const FreshlyCommissioned: Story = { args: { variant: "Freshly commissioned" } };
export const SomeoneElsesDormant: Story = { args: { variant: "Someone else's (dormant)" } };
