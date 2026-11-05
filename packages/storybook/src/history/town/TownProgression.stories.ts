import type { Meta, StoryObj } from "@storybook/html-vite";
import { HISTORIC_TOWN_TIERS, TOWN_ERAS, townEraById, type HistoricTownTier } from "./town-eras.js";
import { renderTownProgressionScene, type TownPlacement } from "./town-progression-scene.js";

type View = "timeline" | "era";

type Args = {
  view: View;
  /** Timeline: the tier every era builds. */
  tier: HistoricTownTier;
  /** Era: which design to show at every tier. */
  era: string;
  cameraDistance: number;
  grass: boolean;
};

const SPACING = 1.35;
// The timeline reads like a page: four eras per row, oldest top-left.
const TIMELINE_COLUMNS = 4;
const TIMELINE_COLUMN_SPACING = 2.2;
const TIMELINE_ROW_SPACING = 1.9;

const centred = (index: number, count: number, spacing = SPACING): number => (index - (count - 1) / 2) * spacing;

const timelinePlacements = (tier: HistoricTownTier): TownPlacement[] => {
  const rows = Math.ceil(TOWN_ERAS.length / TIMELINE_COLUMNS);
  return TOWN_ERAS.map((era, i) => ({
    era,
    tier,
    x: centred(i % TIMELINE_COLUMNS, TIMELINE_COLUMNS, TIMELINE_COLUMN_SPACING),
    z: centred(Math.floor(i / TIMELINE_COLUMNS), rows, TIMELINE_ROW_SPACING),
    label: `${era.date}\n${era.title}`
  }));
};

const eraPlacements = (eraId: string): TownPlacement[] => {
  const era = townEraById(eraId);
  return HISTORIC_TOWN_TIERS.map((tier, i) => ({ era, tier, x: centred(i, HISTORIC_TOWN_TIERS.length), z: 0, label: tier }));
};

const caption = (args: Args): HTMLElement => {
  const el = document.createElement("div");
  el.style.cssText = "padding:10px 14px;font:13px/1.45 system-ui,sans-serif;color:#d8dee9;background:#121722;";
  if (args.view === "timeline") {
    el.textContent = `Every town design the game has shipped, oldest top-left, each building a ${args.tier}.`;
    return el;
  }
  const era = townEraById(args.era);
  const title = document.createElement("strong");
  title.textContent = `${era.date} · ${era.title}`;
  const commit = era.commit === "develop" ? "the live client code" : `the town code at commit ${era.commit}`;
  el.append(title, document.createElement("br"), `${era.summary} Rendered from ${commit}.`);
  return el;
};

const render = (args: Args): HTMLElement => {
  const placements = args.view === "timeline" ? timelinePlacements(args.tier) : eraPlacements(args.era);
  const scene = renderTownProgressionScene({
    placements,
    cameraDistance: args.cameraDistance,
    cameraTilt: 0.62,
    grass: args.grass,
    groundRadius: args.view === "timeline" ? 5 : Math.ceil((placements.length * SPACING) / 2) + 1
  });
  const root = document.createElement("div");
  root.append(caption(args), scene);
  return root;
};

const ERA_LABELS = Object.fromEntries(TOWN_ERAS.map((era) => [era.id, `${era.date} · ${era.title}`]));

const meta: Meta<Args> = {
  title: "History/Town Progression",
  parameters: {
    docs: {
      description: {
        component: [
          "How the 3D town has looked over the game's development, from the first April 2026 houses to the town shipping today.",
          "Each era renders a frozen copy of the client's town code from the commit that closed that era",
          "(`packages/storybook/src/history/town/<era>/`); the last era renders the live `client-map-3d-town-overlay`.",
          "When the shipped town is redesigned, snapshot the outgoing code into a new era folder and add it to `town-eras.ts`.",
          "",
          ...TOWN_ERAS.map((era) => `- **${era.date} · ${era.title}** — ${era.summary}`)
        ].join("\n")
      }
    }
  },
  argTypes: {
    view: { control: { type: "inline-radio", labels: { timeline: "Every era, one tier", era: "One era, every tier" } }, options: ["timeline", "era"] },
    tier: { control: "select", options: [...HISTORIC_TOWN_TIERS], if: { arg: "view", eq: "timeline" } },
    era: { control: { type: "select", labels: ERA_LABELS }, options: TOWN_ERAS.map((era) => era.id), if: { arg: "view", eq: "era" } },
    cameraDistance: { control: { type: "range", min: 3, max: 24, step: 0.5 } },
    grass: { control: "boolean" }
  },
  args: { view: "timeline", tier: "CITY", era: "live", cameraDistance: 9.5, grass: false },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const TimelineSettlement: Story = { name: "Timeline · Settlement", args: { tier: "SETTLEMENT", cameraDistance: 8.5 } };
export const TimelineTown: Story = { name: "Timeline · Town", args: { tier: "TOWN" } };
export const TimelineCity: Story = { name: "Timeline · City", args: { tier: "CITY" } };
export const TimelineGreatCity: Story = { name: "Timeline · Great City", args: { tier: "GREAT_CITY" } };
export const TimelineMetropolis: Story = { name: "Timeline · Metropolis", args: { tier: "METROPOLIS", cameraDistance: 10 } };

// One story per era, oldest first. Names are literal so the sidebar index can read them.
export const FirstHouses: Story = { name: "01 · Apr 2026 · First houses", args: { view: "era", era: "first-houses", cameraDistance: 6 } };
export const TierScaledClusters: Story = { name: "02 · May 2026 · Tier-scaled clusters", args: { view: "era", era: "tier-scaled-blocks", cameraDistance: 6 } };
export const SteampunkTiers: Story = { name: "03 · Aug 2026 · Steampunk tiers", args: { view: "era", era: "steampunk-tiers", cameraDistance: 6 } };
export const TexturedModels: Story = { name: "04 · Oct 2026 · Textured models", args: { view: "era", era: "textured-models", cameraDistance: 6 } };
export const SunlitProcedural: Story = { name: "05 · Oct 2026 · Sunlit procedural", args: { view: "era", era: "sunlit-procedural", cameraDistance: 6 } };
export const SteampunkWithSoul: Story = { name: "06 · Oct 2026 · Steampunk with soul", args: { view: "era", era: "steampunk-soul", cameraDistance: 6 } };
export const ClockworkSkyscrapers: Story = { name: "07 · Oct 2026 · Clockwork skyscrapers", args: { view: "era", era: "clockwork-skyscrapers", cameraDistance: 6 } };
export const GlassSkyscrapers: Story = { name: "08 · Oct 2026 · Glass skyscrapers", args: { view: "era", era: "glass-skyscrapers", cameraDistance: 6 } };
export const StreetGrid: Story = { name: "09 · Oct 2026 · Street grid", args: { view: "era", era: "street-grid", cameraDistance: 6 } };
export const AaaPolish: Story = { name: "10 · Oct 2026 · AAA polish", args: { view: "era", era: "aaa-polish", cameraDistance: 6 } };
export const BannersAndFountains: Story = { name: "11 · Oct 2026 · Banners and fountains", args: { view: "era", era: "banners-fountains", cameraDistance: 6 } };
export const MarblePlinthLive: Story = { name: "12 · Today · Marble plinth (live)", args: { view: "era", era: "live", cameraDistance: 6 } };
