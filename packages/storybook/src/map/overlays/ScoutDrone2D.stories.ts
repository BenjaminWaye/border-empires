import type { Meta, StoryObj } from "@storybook/html-vite";
import { planScoutDroneFlight, scoutDroneStepIndexAt, SCOUT_DRONE_VISION_RADIUS, type ScoutDroneFlight } from "@border-empires/shared";
import { drawScoutDrone2D } from "@client/client-map-render-2d-scout-drone/client-map-render-2d-scout-drone.js";

// The 2D canvas counterpart of the Scout Drone story (client-map-render-2d-scout-drone.ts), on the
// same stand-in board: the player's land (gold), a rival's (red), seen ground (grass) and
// unexplored ground (dark). `progress` scrubs the flight.
type Args = { progress: number; tileSize: number };

const GRID_W = 30;
const GRID_H = 16;
const AFC_TILE = { x: 3, y: 8 };
const OWN_RADIUS = 4;
const RIVAL_FROM_X = 23;
const WORLD = { width: 64, height: 32 };

const isOwn = (x: number, y: number): boolean => Math.max(Math.abs(x - AFC_TILE.x), Math.abs(y - AFC_TILE.y)) <= OWN_RADIUS;

const flight = planScoutDroneFlight(AFC_TILE, { x: 27, y: 5 }, 0, {
  ...WORLD,
  classify: (x, y) => (isOwn(x, y) ? { kind: "HOME" } : x >= RIVAL_FROM_X ? { kind: "BLOCKED", ownerId: "rival" } : { kind: "OPEN" })
}) as ScoutDroneFlight;

const render = (args: Args): HTMLElement => {
  const size = args.tileSize;
  const canvas = document.createElement("canvas");
  canvas.width = GRID_W * size;
  canvas.height = GRID_H * size;
  canvas.style.cssText = "display:block;background:#0d1218";
  const ctx = canvas.getContext("2d")!;
  let raf = 0;
  const start = performance.now();
  const frame = (): void => {
    const real = performance.now();
    const t = args.progress * flight.landsAt;
    const shift = real - t;
    const index = scoutDroneStepIndexAt(flight, t);
    const seen = new Set<string>();
    for (let i = 0; i <= index; i += 1) {
      const step = flight.steps[i]!;
      for (let dy = -SCOUT_DRONE_VISION_RADIUS; dy <= SCOUT_DRONE_VISION_RADIUS; dy += 1)
        for (let dx = -SCOUT_DRONE_VISION_RADIUS; dx <= SCOUT_DRONE_VISION_RADIUS; dx += 1) seen.add(`${step.x + dx},${step.y + dy}`);
    }
    ctx.fillStyle = "#0d1218";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < GRID_H; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        const visible = Math.max(Math.abs(x - AFC_TILE.x), Math.abs(y - AFC_TILE.y)) <= OWN_RADIUS + 1 || seen.has(`${x},${y}`);
        ctx.fillStyle = !visible ? "#1b2129" : isOwn(x, y) ? "#b08a3a" : x >= RIVAL_FROM_X ? "#a2473f" : (x + y) % 2 === 0 ? "#5d8a3a" : "#52803a";
        ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      }
    }
    const shifted: ScoutDroneFlight = { ...flight, launchedAt: flight.launchedAt + shift, landsAt: flight.landsAt + shift, steps: flight.steps.map((s) => ({ ...s, at: s.at + shift })) };
    drawScoutDrone2D(ctx, shifted, real, WORLD, (wx, wy) => ({ sx: (wx + 0.5) * size, sy: (wy + 0.5) * size }), size);
    if (performance.now() - start < 600_000) raf = requestAnimationFrame(frame);
  };
  frame();
  const root = document.createElement("div");
  root.appendChild(canvas);
  new MutationObserver((_, observer) => {
    if (!document.body.contains(root)) {
      cancelAnimationFrame(raf);
      observer.disconnect();
    }
  }).observe(document.body, { childList: true, subtree: true });
  return root;
};

const meta: Meta<Args> = {
  title: "Map/Overlays/Scout Drone 2D",
  argTypes: {
    progress: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    tileSize: { control: { type: "range", min: 12, max: 64, step: 2 } }
  },
  args: { progress: 0.4, tileSize: 40 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Outbound: Story = {};
export const Returning: Story = { args: { progress: 0.62 } };
