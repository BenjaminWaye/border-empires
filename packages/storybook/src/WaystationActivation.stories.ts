import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  showWaystationActivationOverlay,
  type WaystationActivationInfo
} from "@client/client-waystation-activation/client-waystation-activation.js";

const DEFAULT_VARIANT = "VISION (town found)";

const VARIANTS: Record<string, WaystationActivationInfo> = {
  "VISION (town found)": {
    x: 214,
    y: 88,
    grantedEffect: "VISION",
    revealedAtX: 220,
    revealedAtY: 92,
    revealedTown: true,
    onJumpToLocation: () => {}
  },
  "VISION (fallback, no town nearby)": {
    x: 214,
    y: 88,
    grantedEffect: "VISION",
    revealedAtX: 214,
    revealedAtY: 88,
    revealedTown: false,
    onJumpToLocation: () => {}
  },
  POPULATION: {
    x: 214,
    y: 88,
    grantedEffect: "POPULATION",
    revealedTown: false,
    grantedTownName: "Rivergate",
    grantedTownX: 220,
    grantedTownY: 92,
    onJumpToLocation: () => alert("Jump to Town clicked — in-game this pans the camera to (220, 92).")
  },
  TECH: {
    x: 214,
    y: 88,
    grantedEffect: "TECH",
    revealedTown: false,
    grantedTechName: "Iron Forging",
    grantedTechId: "iron-forging",
    onJumpToLocation: () => {},
    onViewTech: (techId) => alert(`View tech clicked — in-game this opens the tech detail panel for "${techId}".`)
  },
  RESOURCE_SLOT: {
    x: 214,
    y: 88,
    grantedEffect: "RESOURCE_SLOT",
    revealedTown: false,
    grantedResource: "CRYSTAL",
    onJumpToLocation: () => {}
  }
};

const render = (_args: unknown, context: { loaded?: Record<string, unknown> }): HTMLElement => {
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
  header.textContent = "Waystation Activation — Actual In-Game Modal";
  container.appendChild(header);

  const subtitle = document.createElement("p");
  subtitle.style.margin = "0 0 4px 0";
  subtitle.style.color = "rgba(201, 216, 236, 0.6)";
  subtitle.style.fontSize = "12.5px";
  subtitle.style.lineHeight = "1.5";
  subtitle.textContent =
    "Rendered by calling showWaystationActivationOverlay() from client-waystation-activation.ts directly — not a copy. Click a button to pop the real overlay.";
  container.appendChild(subtitle);

  const variantName = (context as { args?: { variant?: string } }).args?.variant ?? DEFAULT_VARIANT;
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
  trigger.addEventListener("click", () => showWaystationActivationOverlay(info));
  container.appendChild(trigger);

  showWaystationActivationOverlay(info);

  return container;
};

const meta: Meta<{ variant: string }> = {
  title: "UI/Waystation Activation",
  argTypes: {
    variant: {
      control: "select",
      options: Object.keys(VARIANTS)
    }
  },
  args: {
    variant: "VISION (town found)"
  },
  parameters: {
    backgrounds: { default: "game" },
    docs: {
      description: {
        component:
          "The Waystation activation reward modal, rendered with the real showWaystationActivationOverlay() from client-waystation-activation.ts. Now has a bespoke inline-SVG hero (frontier rig, glowing lens) matching the town-capture popup's treatment (see UI/Town Capture), plus a two-line body: a narrative sentence explaining what happened, and a bold 'Modifiers' line with the concrete effect."
      }
    }
  },
  render
};

export default meta;
type Story = StoryObj<{ variant: string }>;

export const VisionTownFound: Story = { args: { variant: "VISION (town found)" } };
export const VisionFallback: Story = { args: { variant: "VISION (fallback, no town nearby)" } };
export const Population: Story = { args: { variant: "POPULATION" } };
export const Tech: Story = { args: { variant: "TECH" } };
export const ResourceSlot: Story = { args: { variant: "RESOURCE_SLOT" } };
