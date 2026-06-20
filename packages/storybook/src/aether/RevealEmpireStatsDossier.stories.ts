import type { Meta, StoryObj } from "@storybook/html-vite";
import { revealEmpireStatsDossierHtml } from "@client/client-empire-intel.js";
import type { RevealEmpireStatsView } from "@client/client-types.js";
import "@client/style.css";

type Args = {
  playerName: string;
  incomePerMinute: number;
  tiles: number;
  settledTiles: number;
  frontierTiles: number;
  controlledTowns: number;
  techCount: number;
  gold: number;
  manpower: number;
  manpowerCap: number;
};

const statsForArgs = (args: Args): RevealEmpireStatsView => ({
  playerId: "enemy-1",
  playerName: args.playerName,
  revealedAt: Date.now(),
  tiles: args.tiles,
  settledTiles: args.settledTiles,
  frontierTiles: args.frontierTiles,
  controlledTowns: args.controlledTowns,
  incomePerMinute: args.incomePerMinute,
  techCount: args.techCount,
  gold: args.gold,
  manpower: args.manpower,
  manpowerCap: args.manpowerCap,
  strategicResources: {
    FOOD: 920,
    IRON: 310,
    CRYSTAL: 184,
    SUPPLY: 540,
    SHARD: 3
  }
});

const render = (args: Args): HTMLElement => {
  const root = document.createElement("div");
  root.id = "hud";
  root.style.minHeight = "100vh";
  root.style.background = "radial-gradient(circle at 50% 10%, #1d3347, #081019 58%, #03070c)";

  const overlay = document.createElement("div");
  overlay.id = "intel-overlay";
  overlay.style.display = "grid";
  overlay.innerHTML = revealEmpireStatsDossierHtml(statsForArgs(args));
  root.appendChild(overlay);

  overlay.querySelectorAll("[data-intel-close]").forEach((node) => {
    node.addEventListener("click", () => {
      overlay.style.display = overlay.style.display === "none" ? "grid" : "none";
    });
  });

  return root;
};

const meta: Meta<Args> = {
  title: "Aether Abilities/Reveal Empire Stats Dossier",
  argTypes: {
    playerName: { control: "text" },
    incomePerMinute: { control: { type: "range", min: 0, max: 250, step: 1 } },
    tiles: { control: { type: "range", min: 1, max: 500, step: 1 } },
    settledTiles: { control: { type: "range", min: 1, max: 250, step: 1 } },
    frontierTiles: { control: { type: "range", min: 0, max: 250, step: 1 } },
    controlledTowns: { control: { type: "range", min: 0, max: 50, step: 1 } },
    techCount: { control: { type: "range", min: 0, max: 30, step: 1 } },
    gold: { control: { type: "range", min: 0, max: 100000, step: 500 } },
    manpower: { control: { type: "range", min: 0, max: 50000, step: 250 } },
    manpowerCap: { control: { type: "range", min: 100, max: 50000, step: 250 } }
  },
  args: {
    playerName: "Northern Meridian",
    incomePerMinute: 86.4,
    tiles: 142,
    settledTiles: 91,
    frontierTiles: 51,
    controlledTowns: 12,
    techCount: 9,
    gold: 28450,
    manpower: 13200,
    manpowerCap: 21000
  },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
