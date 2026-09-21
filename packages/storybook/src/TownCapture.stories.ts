import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  showTownCaptureOverlay,
  type TownCaptureInfo
} from "@client/client-town-capture/client-town-capture.js";

const DEFAULT_VARIANT = "Captured (Town)";

const VARIANTS: Record<string, TownCaptureInfo> = {
  "Captured (Town)": {
    x: 214,
    y: 88,
    townName: "Rivergate",
    populationTier: "TOWN",
    terrainProfile: "COASTAL_DESERT",
    coastal: true,
    population: 3200,
    maxPopulation: 4000,
    empireName: "Your Empire",
    ownedTownCount: 2,
    destroyed: false,
    onJumpToTown: () => {}
  },
  "Destroyed (Settlement)": {
    x: 90,
    y: 40,
    townName: "Oakford",
    populationTier: "SETTLEMENT",
    terrainProfile: "GRASS",
    coastal: false,
    population: 900,
    maxPopulation: 1200,
    empireName: "The Ashen Legion",
    ownedTownCount: 1,
    destroyed: true,
    onJumpToTown: () => {}
  }
};

const render = (_args: unknown, context: { args?: { variant?: string } }): HTMLElement => {
  const container = document.createElement("div");
  container.style.display = "grid";
  container.style.gap = "16px";
  container.style.padding = "32px 28px";
  container.style.fontFamily = "system-ui, sans-serif";
  container.style.background = "#0a0e14";

  const header = document.createElement("h1");
  header.style.margin = "0";
  header.style.color = "#ffd68f";
  header.style.fontSize = "16px";
  header.style.fontWeight = "800";
  header.textContent = "Town Capture — Actual In-Game Modal (for comparison with Waystation Activation)";
  container.appendChild(header);

  const subtitle = document.createElement("p");
  subtitle.style.margin = "0 0 4px 0";
  subtitle.style.color = "rgba(201, 216, 236, 0.6)";
  subtitle.style.fontSize = "12.5px";
  subtitle.style.lineHeight = "1.5";
  subtitle.textContent =
    "Rendered by calling showTownCaptureOverlay() from client-town-capture.ts directly. Note the SVG skyline hero, town name, tier, and stat grid — for comparison against the Waystation Activation modal's simpler single-hero + narrative/modifier layout (see UI/Waystation Activation).";
  container.appendChild(subtitle);

  const variantName = context.args?.variant ?? DEFAULT_VARIANT;
  const info = VARIANTS[variantName] ?? VARIANTS[DEFAULT_VARIANT]!;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.textContent = `Show: ${variantName}`;
  trigger.style.justifySelf = "start";
  trigger.style.padding = "10px 18px";
  trigger.style.borderRadius = "10px";
  trigger.style.border = "1px solid rgba(255,214,148,0.5)";
  trigger.style.background = "linear-gradient(180deg, rgba(255,214,148,0.22), rgba(214,150,68,0.14))";
  trigger.style.color = "#ffe6b8";
  trigger.style.fontSize = "13px";
  trigger.style.fontWeight = "800";
  trigger.style.cursor = "pointer";
  trigger.addEventListener("click", () => showTownCaptureOverlay(info));
  container.appendChild(trigger);

  showTownCaptureOverlay(info);

  return container;
};

const meta: Meta<{ variant: string }> = {
  title: "UI/Town Capture",
  argTypes: {
    variant: { control: "select", options: Object.keys(VARIANTS) }
  },
  args: { variant: "Captured (Town)" },
  parameters: {
    backgrounds: { default: "game" },
    docs: {
      description: {
        component:
          "The town-capture popup, rendered with the real showTownCaptureOverlay() from client-town-capture.ts. Has a bespoke inline-SVG skyline hero, town name/tier header, owner line, and a stat grid (population, gold, manpower). The Waystation Activation modal (see UI/Waystation Activation) has none of this despite its PR description claiming it was 'visually modeled on the town captured popup' — it's eyebrow text + one line of body copy on a plain panel."
      }
    }
  },
  render
};

export default meta;
type Story = StoryObj<{ variant: string }>;

export const Captured: Story = { args: { variant: "Captured (Town)" } };
export const Destroyed: Story = { args: { variant: "Destroyed (Settlement)" } };
