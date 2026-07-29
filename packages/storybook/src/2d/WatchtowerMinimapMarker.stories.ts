import type { Meta, StoryObj } from "@storybook/html-vite";

/**
 * Standalone preview of the watchtower minimap marker/pulse-ring drawing
 * logic added to client-minimap.ts (drawMiniMap's watchtower pass). Draws
 * directly on a canvas rather than exercising the full minimap pipeline
 * (which needs a full game-state fixture), so this mirrors the exact pixel
 * math used there for quick visual review.
 */
type Args = {
  activated: boolean;
  revealing: boolean;
  background: string;
};

const render = (args: Args): HTMLElement => {
  const root = document.createElement("div");
  root.style.padding = "16px";
  root.style.background = "#0a0e14";
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.gap = "8px";
  root.style.fontFamily = "system-ui, sans-serif";
  root.style.color = "#cbd5e1";

  const label = document.createElement("div");
  label.style.fontSize = "13px";
  label.style.opacity = "0.7";
  label.textContent = `watchtower marker — activated=${args.activated} revealing=${args.revealing}`;

  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 240;
  canvas.style.border = "1px solid #1f2937";
  canvas.style.borderRadius = "6px";
  const ctx = canvas.getContext("2d")!;

  const tx = canvas.width / 2;
  const ty = canvas.height / 2;
  let rafId = 0;

  const draw = (nowMs: number): void => {
    ctx.fillStyle = args.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const pingPhase = 0.5 + 0.5 * Math.sin(nowMs / 240);

    // Mirrors client-minimap.ts's watchtower marker pass exactly.
    ctx.fillStyle = args.activated ? "rgba(255, 190, 110, 0.95)" : "rgba(150, 120, 80, 0.75)";
    ctx.beginPath();
    ctx.arc(tx, ty, 6, 0, Math.PI * 2);
    ctx.fill();

    if (args.revealing) {
      ctx.strokeStyle = `rgba(255, 179, 71, ${0.5 + pingPhase * 0.35})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(tx, ty, (5 + pingPhase * 3) * 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    rafId = requestAnimationFrame(draw);
  };
  rafId = requestAnimationFrame(draw);

  root.append(label, canvas);
  (root as HTMLElement & { __cleanup?: () => void }).__cleanup = () => cancelAnimationFrame(rafId);
  return root;
};

const meta: Meta<Args> = {
  title: "2D Library/WatchtowerMinimapMarker",
  parameters: {
    docs: {
      description: {
        component:
          "Minimap marker for watchtower sites (see client-minimap.ts). Dim dot while dormant, brighter once activated, plus an expanding pulse ring for ~10s right after a player expands onto the tile."
      }
    }
  },
  argTypes: {
    activated: { control: "boolean" },
    revealing: { control: "boolean" },
    background: { control: "color" }
  },
  args: { activated: false, revealing: false, background: "#0b1320" },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Dormant: Story = {};
export const Activated: Story = { args: { activated: true } };
export const Revealing: Story = { args: { activated: true, revealing: true } };
