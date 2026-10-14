import type { Meta, StoryObj } from "@storybook/html-vite";
import { incursionHatchColors, incursionMarkColor } from "@client/client-reach-incursion/client-reach-incursion.js";
import {
  BREACH_EDGE_LABELS,
  BREACH_EDGE_STYLES,
  MINE_HALF_HEIGHT,
  MINE_HALF_WIDTH,
  buildBreachDemoWorld,
  buildBreachEdgePolygons,
  parseTileKey,
  type BreachEdgeStyle
} from "../incursion-breach/incursion-breach-prototypes.js";

/**
 * 2D canvas twin of 3D Library/IncursionBreachEdge: the same prototype edge
 * shapes (incursion-breach-prototypes.ts) drawn top-down, the way the 2D
 * fallback renderer would show them. The hatch mirrors
 * client-reach-incursion-2d.ts (4 stripe pairs per tile at 60% alpha).
 */

type Args = {
  style: BreachEdgeStyle;
  tileSize: number;
  myColor: string;
  intruderColor: string;
};

const BACKGROUND = "#0a0e14";
const UNOWNED = "#5e7c30";
const OWNERSHIP_ALPHA = 0.78;
const HATCH_ALPHA = 0.6;
const HATCH_STRIPES = 4;
const MARGIN_TILES = 1;

const drawHatch = (ctx: CanvasRenderingContext2D, px: number, py: number, size: number, theirs: string, mine: string): void => {
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, size, size);
  ctx.clip();
  ctx.globalAlpha = HATCH_ALPHA;
  ctx.fillStyle = mine;
  ctx.fillRect(px, py, size, size);
  ctx.fillStyle = theirs;
  const step = size / HATCH_STRIPES;
  ctx.beginPath();
  for (let k = -HATCH_STRIPES; k <= HATCH_STRIPES * 2; k += 1) {
    const c0 = px + k * step;
    const c1 = c0 + step / 2;
    ctx.moveTo(c0, py);
    ctx.lineTo(c1, py);
    ctx.lineTo(c1 - size, py + size);
    ctx.lineTo(c0 - size, py + size);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
};

const renderPanel = (args: Args, label: string): HTMLElement => {
  const world = buildBreachDemoWorld();
  const cols = MINE_HALF_WIDTH * 2 + 1 + MARGIN_TILES * 2;
  const rows = MINE_HALF_HEIGHT * 2 + 1 + MARGIN_TILES * 2;
  const size = args.tileSize;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = cols * size * dpr;
  canvas.height = rows * size * dpr;
  canvas.style.width = `${cols * size}px`;
  canvas.style.height = `${rows * size}px`;
  canvas.style.display = "block";
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.scale(dpr, dpr);
    // Tile (x, y) -> pixel top-left; world is centred on tile (0, 0).
    const toPx = (x: number): number => (x + MINE_HALF_WIDTH + MARGIN_TILES) * size;
    const toPy = (y: number): number => (y + MINE_HALF_HEIGHT + MARGIN_TILES) * size;
    ctx.fillStyle = UNOWNED;
    ctx.fillRect(0, 0, cols * size, rows * size);

    ctx.globalAlpha = OWNERSHIP_ALPHA;
    for (const [keys, color] of [
      [world.mine, args.myColor],
      [world.pocket, args.intruderColor]
    ] as const) {
      ctx.fillStyle = color;
      for (const key of keys) {
        const { x, y } = parseTileKey(key);
        ctx.fillRect(toPx(x), toPy(y), size, size);
      }
    }
    ctx.globalAlpha = 1;

    const hatch = incursionHatchColors(args.intruderColor, args.myColor);
    for (const key of world.pocket) {
      const { x, y } = parseTileKey(key);
      drawHatch(ctx, toPx(x), toPy(y), size, hatch.theirs, hatch.mine);
    }

    const mark = incursionMarkColor(args.intruderColor);
    // Polygon points are tile-space with tile centres on integers, so shift by half a tile.
    const sx = (x: number): number => toPx(x + 0.5);
    const sy = (y: number): number => toPy(y + 0.5);
    for (const polygon of buildBreachEdgePolygons(world, args.style)) {
      ctx.fillStyle = polygon.paint === "intruder" ? args.intruderColor : mark;
      ctx.beginPath();
      polygon.points.forEach((p, i) => (i === 0 ? ctx.moveTo(sx(p.x), sy(p.y)) : ctx.lineTo(sx(p.x), sy(p.y))));
      ctx.closePath();
      ctx.fill();
    }
  }

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:inline-flex;flex-direction:column;gap:6px;";
  const caption = document.createElement("div");
  caption.textContent = label;
  caption.style.cssText = "color:#f1e6c8;font:600 14px system-ui,sans-serif;";
  wrapper.append(caption, canvas);
  return wrapper;
};

const page = (children: HTMLElement[]): HTMLElement => {
  const root = document.createElement("div");
  root.style.cssText = `display:flex;flex-wrap:wrap;gap:20px;padding:16px;background:${BACKGROUND};min-height:100vh;box-sizing:border-box;`;
  root.append(...children);
  return root;
};

const meta: Meta<Args> = {
  title: "2D Library/IncursionBreachEdge2D",
  argTypes: {
    style: { control: { type: "select" }, options: [...BREACH_EDGE_STYLES] },
    tileSize: { control: { type: "range", min: 16, max: 72, step: 2 } },
    myColor: { control: { type: "color" } },
    intruderColor: { control: { type: "color" } }
  },
  args: { style: "spikes", tileSize: 44, myColor: "#e0535d", intruderColor: "#7be05a" },
  render: (args) => page([renderPanel(args, BREACH_EDGE_LABELS[args.style])])
};

export default meta;
type Story = StoryObj<Args>;

const renderCompare = (args: Args): HTMLElement => page(BREACH_EDGE_STYLES.map((style) => renderPanel({ ...args, style }, BREACH_EDGE_LABELS[style])));

export const CompareAll: Story = { render: renderCompare };
export const CompareAllDarkIntruder: Story = { args: { intruderColor: "#2b3a8c" }, render: renderCompare };
/** Zoomed-out tile size: checks the shapes don't turn to noise at small scale. */
export const CompareAllZoomedOut: Story = { args: { tileSize: 20 }, render: renderCompare };
