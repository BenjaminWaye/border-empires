import type { Meta, StoryObj } from "@storybook/html-vite";
import { drawAetherBridgeLane } from "@client/client-map-render/client-map-render.js";

// The animated Aether Bridge lane (see drawAetherBridgeLane in
// client-map-render.ts): a pulsing cyan sea-lane with an anchor glyph at
// each coast and energy motes travelling along it. This is a 2D canvas
// draw, not a 3D overlay, so it renders straight onto a canvas here with
// its own RAF so the pulse/dash animation plays.

type Args = {
  lengthPx: number;
  angleDeg: number;
  compact: boolean;
  background: "water" | "dark";
};

const BACKGROUNDS: Record<Args["background"], string> = {
  water: "#1c3a57",
  dark: "#0a0e14"
};

const CANVAS_SIZE = 480;

const render = (args: Args): HTMLElement => {
  const root = document.createElement("div");
  root.style.padding = "16px";
  root.style.background = "#0a0e14";

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  canvas.style.width = "100%";
  canvas.style.maxWidth = `${CANVAS_SIZE}px`;
  canvas.style.display = "block";
  canvas.style.borderRadius = "6px";
  root.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const center = CANVAS_SIZE / 2;
  const half = args.lengthPx / 2;
  const radians = (args.angleDeg * Math.PI) / 180;
  const fromX = center - Math.cos(radians) * half;
  const fromY = center - Math.sin(radians) * half;
  const toX = center + Math.cos(radians) * half;
  const toY = center + Math.sin(radians) * half;

  let rafId = 0;
  const frame = (): void => {
    if (ctx) {
      ctx.fillStyle = BACKGROUNDS[args.background];
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      drawAetherBridgeLane(ctx, fromX, fromY, toX, toY, performance.now(), { compact: args.compact });
    }
    rafId = requestAnimationFrame(frame);
  };
  frame();

  const observer = new MutationObserver(() => {
    if (!document.body.contains(root)) {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return root;
};

const meta: Meta<Args> = {
  title: "Aether Abilities/Aether Bridge Lane",
  argTypes: {
    lengthPx: { control: { type: "range", min: 40, max: 420, step: 10 } },
    angleDeg: { control: { type: "range", min: 0, max: 180, step: 5 } },
    compact: { control: "boolean" },
    background: { control: "inline-radio", options: ["water", "dark"] }
  },
  args: { lengthPx: 320, angleDeg: 25, compact: false, background: "water" },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const Compact: Story = { args: { compact: true, lengthPx: 160 } };
