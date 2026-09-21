import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/style.css";
import "@client/client-town-stat-grid-style.css";
import "@client/client-steampunk-theme-style.css";
import "@client/client-steampunk-tile-menu-style.css";
import { townStatGridHtml, type TownStatGridInput } from "@client/client-town-stat-grid/client-town-stat-grid.js";

type TownCharacterExample = {
  name: string;
  townName: string;
  stats: TownStatGridInput;
};

const commonStats = {
  population: 23_410,
  maxPopulation: 100_000,
  nextTierPopulation: 100_000,
  populationTierLabel: "Town",
  growthText: "+7.47/m — City in ~8d",
  growthTone: "positive" as const,
  support: { current: 8, max: 8 },
  food: { satisfied: 4, demand: 4, fed: true }
};

const EXAMPLES: TownCharacterExample[] = [
  {
    name: "Fertile Town",
    townName: "Millhaven",
    stats: {
      ...commonStats,
      goldPerDayLabel: "9.9",
      manpowerCapLabel: "300",
      manpowerRegenLabel: "+0.42/min base regen",
      townModifiers: [{
        label: "Fertile Town",
        goldOutputPercent: 0,
        manpowerCapacityPercent: 0,
        manpowerRegenPercent: 0
      }]
    }
  },
  {
    name: "Trade Town",
    townName: "Sunspear",
    stats: {
      ...commonStats,
      goldPerDayLabel: "15.8",
      manpowerCapLabel: "180",
      manpowerRegenLabel: "+0.25/min base regen",
      townModifiers: [{
        label: "Trade Town",
        goldOutputPercent: 60,
        manpowerCapacityPercent: -40,
        manpowerRegenPercent: -40
      }]
    }
  },
  {
    name: "Tundra Town",
    townName: "Frostforge",
    stats: {
      ...commonStats,
      goldPerDayLabel: "5.9",
      manpowerCapLabel: "165",
      manpowerRegenLabel: "+0.23/min base regen",
      townModifiers: [{
        label: "Tundra Town",
        goldOutputPercent: -40,
        manpowerCapacityPercent: -45,
        manpowerRegenPercent: -45
      }]
    }
  },
  {
    name: "Trade Town · Coastal Town",
    townName: "Harborhold",
    stats: {
      ...commonStats,
      goldPerDayLabel: "17.8",
      manpowerCapLabel: "216",
      manpowerRegenLabel: "+0.30/min base regen",
      townModifiers: [
        { label: "Trade Town", goldOutputPercent: 60, manpowerCapacityPercent: -40, manpowerRegenPercent: -40 },
        { label: "Coastal Town", goldOutputPercent: 20, manpowerCapacityPercent: 20, manpowerRegenPercent: 20 }
      ]
    }
  }
];

const render = (): HTMLElement => {
  const root = document.createElement("main");
  root.style.cssText = "min-height:100vh;padding:28px;background:radial-gradient(circle at 50% 0,#322414,#100c07 55%,#080604);font-family:var(--sp-font-body,serif);";

  const heading = document.createElement("header");
  heading.style.cssText = "max-width:720px;margin:0 auto 22px;color:var(--sp-parchment-300,#d9c9aa);";
  heading.innerHTML = "<div style=\"color:var(--sp-brass-300,#d9ad52);font:700 11px var(--sp-font-display,serif);letter-spacing:.12em;text-transform:uppercase\">Town Overview</div><h1 style=\"margin:5px 0 7px;color:var(--sp-brass-100,#f4dfa6);font:700 24px var(--sp-font-display,serif)\">Terrain inside the town sheet</h1><p style=\"margin:0;font-size:13px;line-height:1.5\">Every town identifies its character beneath its name. The Gold and Manpower cards then explain only the non-zero effects.</p>";
  root.appendChild(heading);

  const grid = document.createElement("section");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,320px));justify-content:center;gap:20px;";
  for (const example of EXAMPLES) {
    const card = document.createElement("article");
    card.style.cssText = "display:grid;gap:8px;";
    card.innerHTML = `<div class="tile-action-head"><div class="tile-action-title">${example.townName} (512, 30)</div><div class="tile-action-town-character">Town character · <strong>${example.name}</strong></div><div class="tile-action-subtitle">Your settled land</div></div><div class="tile-overview-line tile-overview-line-statgrid">${townStatGridHtml(example.stats)}</div>`;
    grid.appendChild(card);
  }
  root.appendChild(grid);
  return root;
};

const meta: Meta = {
  title: "UI/Town Terrain Overview",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "The shipped town header and stat-grid renderer. Town character is always visible beneath the town name; terrain and coastal effects appear only where they alter Gold or Manpower."
      }
    }
  },
  render
};

export default meta;
type Story = StoryObj;

export const AllTownCharacters: Story = {};
