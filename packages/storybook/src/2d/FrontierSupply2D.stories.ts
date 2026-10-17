import type { Meta, StoryObj } from "@storybook/html-vite";
import { drawFrontierSupply2D } from "@client/client-frontier-supply/client-frontier-supply-2d.js";
import { drawReachBoundaryLine } from "@client/client-reach-overlay/client-reach-overlay.js";
import { buildSupplyDemoWorld, DEMO_COLOR, DEMO_WORLD, SUPPLY_SCENARIO_DESCRIPTIONS, type SupplyScenario } from "../frontier-supply/frontier-supply-demo-world.js";

/**
 * The real 2D-canvas frontier supply renderer (client-frontier-supply-2d.ts,
 * the accessibility fallback's counterpart to the 3D overlay), fed by the real
 * supply model and drawn with the real reach boundary line. Tile fills are a
 * plain stand-in for the 2D terrain/ownership pass.
 */

type Args = { scenario: SupplyScenario; tileSize: number };

const PAD_TILES = 2;
const GROUND = "#3f5d3a";

const render = (args: Args): HTMLElement => {
  const world = buildSupplyDemoWorld(args.scenario);
  const size = args.tileSize;
  const originX = world.minX - PAD_TILES;
  const originY = world.minY - PAD_TILES;
  const cols = world.maxX - world.minX + 1 + PAD_TILES * 2;
  const rows = world.maxY - world.minY + 1 + PAD_TILES * 2;

  const root = document.createElement("div");
  root.style.cssText = "padding:16px;background:#0a0e14;color:#cbd5e1;font:13px system-ui,sans-serif;min-height:100vh";
  const caption = document.createElement("div");
  caption.style.cssText = "margin-bottom:12px;opacity:.75;max-width:720px";
  caption.textContent = SUPPLY_SCENARIO_DESCRIPTIONS[args.scenario];
  const canvas = document.createElement("canvas");
  canvas.width = cols * size;
  canvas.height = rows * size;
  root.append(caption, canvas);
  const ctx = canvas.getContext("2d")!;

  const owned = new Map(world.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const wrap = (v: number): number => ((v % DEMO_WORLD) + DEMO_WORLD) % DEMO_WORLD;
  const reachDeps = { keyFor: (x: number, y: number) => `${x},${y}`, wrapX: wrap, wrapY: wrap };

  let rafId = 0;
  const frame = (): void => {
    const nowMs = performance.now();
    ctx.fillStyle = GROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = originX + col;
        const y = originY + row;
        const tile = owned.get(`${x},${y}`);
        if (!tile) continue;
        ctx.globalAlpha = tile.ownershipState === "SETTLED" ? 0.75 : 0.32;
        ctx.fillStyle = DEMO_COLOR;
        ctx.fillRect(col * size + 1, row * size + 1, size - 2, size - 2);
        ctx.globalAlpha = 1;
        drawReachBoundaryLine(ctx, x, y, col * size, row * size, size, world.reach, DEMO_COLOR, reachDeps);
      }
    }
    drawFrontierSupply2D(ctx, world.model, {
      tileCenter: (x, y) => ({ sx: (x - originX + 0.5) * size, sy: (y - originY + 0.5) * size }),
      wrapDeltaX: (from, to) => to - from,
      wrapDeltaY: (from, to) => to - from,
      size,
      viewportWidth: canvas.width,
      viewportHeight: canvas.height,
      ownerColor: DEMO_COLOR,
      nowMs
    });
    rafId = requestAnimationFrame(frame);
  };
  frame();

  // Stop animating once Storybook unmounts the story.
  const observer = new MutationObserver(() => {
    if (document.body.contains(root)) return;
    cancelAnimationFrame(rafId);
    observer.disconnect();
  });
  requestAnimationFrame(() => observer.observe(document.body, { childList: true, subtree: true }));
  return root;
};

const meta: Meta<Args> = {
  title: "2D Library/FrontierSupply2D",
  parameters: {
    docs: {
      description: {
        component:
          "Frontier supply lines on the 2D canvas map (the fallback renderer for devices without 3D). Same model and look as the " +
          "3D overlay: chevrons flow outward from the reach edge into frontier beyond reach, fainter the further out, and amber " +
          "diamonds pulse on chokepoints."
      }
    }
  },
  argTypes: {
    scenario: { control: "inline-radio", options: ["snake", "corridor", "branching"] },
    tileSize: { control: { type: "range", min: 12, max: 48, step: 2 } }
  },
  args: { scenario: "snake", tileSize: 32 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Snake: Story = {};
export const Corridor: Story = { args: { scenario: "corridor" } };
export const Branching: Story = { args: { scenario: "branching" } };
export const SmallTiles: Story = {
  args: { tileSize: 16 },
  parameters: { docs: { description: { story: "Zoomed out: one chevron per hop instead of two, so the stream stays readable." } } }
};
