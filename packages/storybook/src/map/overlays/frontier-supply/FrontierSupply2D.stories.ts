import type { Meta, StoryObj } from "@storybook/html-vite";
import { drawFrontierSupply2D } from "@client/client-frontier-supply/client-frontier-supply-2d.js";
import { drawReachBoundaryLine } from "@client/client-reach-overlay/client-reach-overlay.js";
import { buildSupplyDemoWorld, DEMO_COLOR, DEMO_RIVAL, DEMO_RIVAL_COLOR, DEMO_WORLD, rerouteCapturesAt, SUPPLY_SCENARIO_DESCRIPTIONS, type SupplyScenario } from "../../../fixtures/frontier-supply-world.js";

/**
 * The real 2D-canvas frontier supply renderer (client-frontier-supply-2d.ts,
 * the accessibility fallback's counterpart to the 3D overlay), fed by the real
 * supply model and drawn with the real reach boundary line. Tile fills are a
 * plain stand-in for the 2D terrain/ownership pass.
 */

type Args = { scenario: SupplyScenario; tileSize: number; reroutePhaseMs: number };

const PAD_TILES = 2;
const GROUND = "#3f5d3a";

const render = (args: Args): HTMLElement => {
  let world = buildSupplyDemoWorld(args.scenario);
  let capturesKey = "";
  const start = performance.now();
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

  let owned = new Map(world.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const wrap = (v: number): number => ((v % DEMO_WORLD) + DEMO_WORLD) % DEMO_WORLD;
  const reachDeps = { keyFor: (x: number, y: number) => `${x},${y}`, wrapX: wrap, wrapY: wrap };

  let rafId = 0;
  const frame = (): void => {
    const nowMs = performance.now();
    if (args.scenario === "reroute") {
      const captures = rerouteCapturesAt(nowMs - start, args.reroutePhaseMs);
      if (captures.join("|") !== capturesKey) {
        capturesKey = captures.join("|");
        world = buildSupplyDemoWorld(args.scenario, captures);
        owned = new Map(world.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
      }
    }
    ctx.fillStyle = GROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = originX + col;
        const y = originY + row;
        const tile = owned.get(`${x},${y}`);
        if (!tile) continue;
        const rival = tile.ownerId === DEMO_RIVAL;
        ctx.globalAlpha = tile.ownershipState === "SETTLED" ? 0.75 : rival ? 0.6 : 0.32;
        ctx.fillStyle = rival ? DEMO_RIVAL_COLOR : DEMO_COLOR;
        ctx.fillRect(col * size + 1, row * size + 1, size - 2, size - 2);
        ctx.globalAlpha = 1;
        if (!rival) drawReachBoundaryLine(ctx, x, y, col * size, row * size, size, world.reach, DEMO_COLOR, reachDeps);
      }
    }
    drawFrontierSupply2D(ctx, world.model, {
      tileCenter: (x, y) => ({ sx: (x - originX + 0.5) * size, sy: (y - originY + 0.5) * size }),
      size,
      viewportWidth: canvas.width,
      viewportHeight: canvas.height,
      ownerColor: DEMO_COLOR,
      nowMs: performance.now()
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
  title: "Map/Overlays/Frontier Supply/2D",
  parameters: {
    docs: {
      description: {
        component:
          "Frontier supply lines on the 2D canvas map (the fallback renderer for devices without 3D). Same model and look as the " +
          "3D overlay: only land beyond reach that hangs on a single tile is flagged, with a pale pulsing line from the nearest " +
          "settled tile, through that tile (marked with a ring), out to the land's far edge."
      }
    }
  },
  argTypes: {
    scenario: { control: "inline-radio", options: ["snake", "corridor", "branching", "reroute"] },
    reroutePhaseMs: { control: { type: "range", min: 1000, max: 8000, step: 500 } },
    tileSize: { control: { type: "range", min: 12, max: 48, step: 2 } }
  },
  args: { scenario: "snake", tileSize: 32, reroutePhaseMs: 3000 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Snake: Story = {};
export const Corridor: Story = { args: { scenario: "corridor" } };
export const Branching: Story = { args: { scenario: "branching" } };
export const Reroute: Story = { args: { scenario: "reroute" } };
export const SmallTiles: Story = {
  args: { tileSize: 16 },
  parameters: { docs: { description: { story: "Zoomed out: the line and ring keep a one-pixel minimum width." } } }
};
