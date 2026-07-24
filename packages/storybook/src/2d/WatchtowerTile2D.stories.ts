import type { Meta, StoryObj } from "@storybook/html-vite";
import { drawWatchtower2D } from "@client/client-map-2d-watchtower-overlay.js";

/**
 * The actual 2D (non-3D-renderer) in-game tile overlay for watchtowers —
 * what players see while playing in 2D mode, drawn directly on their tile
 * canvas via client-runtime-loop.ts. See WatchtowerMinimap.stories.ts for
 * the minimap version and 3D Library/WatchtowerOverlay for the 3D version.
 */
type Args = {
  activated: boolean;
  revealing: boolean;
  size: number;
};

const render = (args: Args): HTMLElement => {
  const root = document.createElement("div");
  root.style.padding = "16px";
  root.style.background = "#0a0e14";
  root.style.fontFamily = "system-ui, sans-serif";
  root.style.color = "#cbd5e1";

  const label = document.createElement("div");
  label.style.fontSize = "13px";
  label.style.opacity = "0.7";
  label.style.marginBottom = "8px";
  label.textContent = `drawWatchtower2D() — activated=${args.activated} revealing=${args.revealing}`;

  const canvas = document.createElement("canvas");
  canvas.width = args.size;
  canvas.height = args.size;
  canvas.style.border = "1px solid #1f2937";
  canvas.style.borderRadius = "6px";
  canvas.style.imageRendering = "pixelated";
  const ctx = canvas.getContext("2d")!;

  const tile = {
    x: 12,
    y: 7,
    watchtower: {
      activated: args.activated,
      ...(args.revealing ? { revealUntil: Date.now() + 60_000 } : {})
    }
  };

  let rafId = 0;
  const animate = (nowMs: number): void => {
    ctx.fillStyle = "#264d2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawWatchtower2D(ctx, tile, 0, 0, args.size, nowMs);
    rafId = requestAnimationFrame(animate);
  };
  rafId = requestAnimationFrame(animate);

  root.append(label, canvas);
  (root as HTMLElement & { __cleanup?: () => void }).__cleanup = () => cancelAnimationFrame(rafId);
  return root;
};

const meta: Meta<Args> = {
  title: "2D Library/WatchtowerTile2D",
  parameters: {
    docs: {
      description: {
        component:
          "In-game 2D tile overlay for watchtowers (client-map-2d-watchtower-overlay.ts): riveted brass tower body, copper band, and a lantern beacon that glows amber once activated, with a pulsing reveal ring during the ~10s flicker window."
      }
    }
  },
  argTypes: {
    activated: { control: "boolean" },
    revealing: { control: "boolean" },
    size: { control: { type: "range", min: 32, max: 160, step: 8 } }
  },
  args: { activated: false, revealing: false, size: 96 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Dormant: Story = {};
export const Activated: Story = { args: { activated: true } };
export const Revealing: Story = { args: { activated: true, revealing: true } };
