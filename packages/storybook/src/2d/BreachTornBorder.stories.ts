import type { Meta, StoryObj } from "@storybook/html-vite";
import { drawBreachTornBorder } from "../../../client/src/client-breach-border/client-breach-border.js";

type Sides = { top: boolean; right: boolean; bottom: boolean; left: boolean };

type Args = {
  tileSize: number;
  columns: number;
  rows: number;
  animate: boolean;
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
};

const FRIENDLY_FILL = "#5c7a52";
const ENEMY_FILL = "#7a3f3f";
const BACKGROUND = "#0a0e14";

// Owner lookup for the grid demo: everything left of the frontline column is
// "mine", everything at/right of it just got captured by the enemy — mirrors
// the scenario that sets breachShockUntil on the still-held neighbours.
const ownerAt = (col: number, row: number, columns: number, rows: number): "me" | "enemy" | "void" => {
  if (col < 0 || row < 0 || col >= columns || row >= rows) return "void";
  const frontline = Math.floor(columns / 2) + (row % 3 === 0 ? 1 : 0);
  return col < frontline ? "me" : "enemy";
};

// Same rule as exposedBorderSides in client-map-render.ts: a side is exposed
// when the neighbour there isn't a friendly tile.
const exposedSides = (col: number, row: number, columns: number, rows: number): Sides => ({
  top: ownerAt(col, row - 1, columns, rows) !== "me",
  right: ownerAt(col + 1, row, columns, rows) !== "me",
  bottom: ownerAt(col, row + 1, columns, rows) !== "me",
  left: ownerAt(col - 1, row, columns, rows) !== "me"
});

const drawSolidExposedBorder = (ctx: CanvasRenderingContext2D, px: number, py: number, size: number, sides: Sides, omit: Sides): void => {
  const x1 = px + 1;
  const y1 = py + 1;
  const x2 = px + size - 2;
  const y2 = py + size - 2;
  ctx.strokeStyle = "rgba(214, 222, 232, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (sides.top && !omit.top) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y1);
  }
  if (sides.right && !omit.right) {
    ctx.moveTo(x2, y1);
    ctx.lineTo(x2, y2);
  }
  if (sides.bottom && !omit.bottom) {
    ctx.moveTo(x2, y2);
    ctx.lineTo(x1, y2);
  }
  if (sides.left && !omit.left) {
    ctx.moveTo(x1, y2);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
};

const renderGrid = (args: Args): HTMLElement => {
  const root = document.createElement("div");
  root.style.padding = "16px";
  root.style.background = BACKGROUND;
  root.style.color = "#cbd5e1";
  root.style.fontFamily = "system-ui, sans-serif";
  root.style.minHeight = "100vh";

  const header = document.createElement("div");
  header.style.marginBottom = "12px";
  header.style.fontSize = "13px";
  header.style.opacity = "0.7";
  header.textContent =
    "Green = my empire, red = the enemy who just captured territory. The torn amber edge only appears where a friendly tile is missing — the rest of each tile's border stays a plain solid line.";

  const canvas = document.createElement("canvas");
  canvas.width = args.columns * args.tileSize;
  canvas.height = args.rows * args.tileSize;
  canvas.style.border = "1px solid #1f2937";
  canvas.style.borderRadius = "6px";

  const ctx = canvas.getContext("2d");
  root.append(header, canvas);
  if (!ctx) return root;

  let rafId = 0;

  const paint = (): void => {
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let row = 0; row < args.rows; row += 1) {
      for (let col = 0; col < args.columns; col += 1) {
        const px = col * args.tileSize;
        const py = row * args.tileSize;
        const owner = ownerAt(col, row, args.columns, args.rows);
        ctx.fillStyle = owner === "me" ? FRIENDLY_FILL : ENEMY_FILL;
        ctx.fillRect(px + 1, py + 1, args.tileSize - 2, args.tileSize - 2);

        if (owner !== "me") continue;

        const sides = exposedSides(col, row, args.columns, args.rows);
        const isBreached = sides.top || sides.right || sides.bottom || sides.left;
        // Solid line covers every exposed side except the freshly-breached one(s).
        drawSolidExposedBorder(ctx, px, py, args.tileSize, sides, isBreached ? sides : { top: false, right: false, bottom: false, left: false });
        if (isBreached) {
          drawBreachTornBorder(ctx, { x: col, y: row }, px, py, args.tileSize, sides);
        }
      }
    }

    if (args.animate) rafId = requestAnimationFrame(paint);
  };

  paint();
  if (!args.animate) setTimeout(paint, 200);

  const cleanup = new MutationObserver(() => {
    if (!document.body.contains(canvas)) {
      cancelAnimationFrame(rafId);
      cleanup.disconnect();
    }
  });
  cleanup.observe(document.body, { childList: true, subtree: true });

  return root;
};

const renderSingleTile = (args: Args): HTMLElement => {
  const root = document.createElement("div");
  root.style.padding = "16px";
  root.style.background = BACKGROUND;
  root.style.color = "#cbd5e1";
  root.style.fontFamily = "system-ui, sans-serif";
  root.style.minHeight = "100vh";

  const header = document.createElement("div");
  header.style.marginBottom = "12px";
  header.style.fontSize = "13px";
  header.style.opacity = "0.7";
  header.textContent = "Toggle sides in Controls to pick which edge(s) are missing a friendly neighbour.";

  const canvas = document.createElement("canvas");
  canvas.width = args.tileSize;
  canvas.height = args.tileSize;
  canvas.style.border = "1px solid #1f2937";
  canvas.style.borderRadius = "6px";

  const ctx = canvas.getContext("2d");
  root.append(header, canvas);
  if (!ctx) return root;

  let rafId = 0;
  const sides: Sides = { top: args.top, right: args.right, bottom: args.bottom, left: args.left };

  const paint = (): void => {
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = FRIENDLY_FILL;
    ctx.fillRect(1, 1, args.tileSize - 2, args.tileSize - 2);
    drawSolidExposedBorder(ctx, 0, 0, args.tileSize, { top: true, right: true, bottom: true, left: true }, sides);
    drawBreachTornBorder(ctx, { x: 0, y: 0 }, 0, 0, args.tileSize, sides);
    if (args.animate) rafId = requestAnimationFrame(paint);
  };

  paint();
  if (!args.animate) setTimeout(paint, 200);

  const cleanup = new MutationObserver(() => {
    if (!document.body.contains(canvas)) {
      cancelAnimationFrame(rafId);
      cleanup.disconnect();
    }
  });
  cleanup.observe(document.body, { childList: true, subtree: true });

  return root;
};

const meta: Meta<Args> = {
  title: "2D Library/Breach Torn Border",
  argTypes: {
    tileSize: { control: { type: "range", min: 24, max: 160, step: 4 } },
    columns: { control: { type: "range", min: 2, max: 12, step: 1 } },
    rows: { control: { type: "range", min: 2, max: 12, step: 1 } },
    animate: { control: "boolean", description: "Animate the pulse (matches in-game Date.now() driven opacity)" },
    top: { control: "boolean" },
    right: { control: "boolean" },
    bottom: { control: "boolean" },
    left: { control: "boolean" }
  },
  args: {
    tileSize: 64,
    columns: 6,
    rows: 6,
    animate: true,
    top: false,
    right: false,
    bottom: true,
    left: false
  },
  render: renderGrid
};

export default meta;

type Story = StoryObj<Args>;

export const Grid: Story = {};
export const Static: Story = { args: { animate: false } };
export const SingleTile: Story = { render: renderSingleTile, args: { tileSize: 200 } };
