import type { Meta, StoryObj } from "@storybook/html-vite";
import { drawMiniMap } from "@client/client-minimap/client-minimap.js";
import type { Tile } from "@client/client-types.js";

/**
 * Drives the real minimap renderer (client-minimap.ts's drawMiniMap) against
 * a small synthetic tile set — this is the actual 2D code path the game
 * uses, not a mock. See WatchtowerMinimapMarker.stories.ts for an isolated
 * pixel-math preview of just the marker/pulse-ring drawing.
 */
type Args = {
  activated: boolean;
  revealing: boolean;
};

const WORLD = 40;

const buildTiles = (args: Args): Map<string, Tile> => {
  const tiles = new Map<string, Tile>();
  for (let y = 0; y < WORLD; y += 1) {
    for (let x = 0; x < WORLD; x += 1) {
      tiles.set(`${x},${y}`, { x, y, terrain: (x + y) % 9 === 0 ? "SEA" : "LAND" });
    }
  }
  tiles.set(`${WORLD / 2},${WORLD / 2}`, {
    x: WORLD / 2,
    y: WORLD / 2,
    terrain: "LAND",
    watchtower: {
      activated: args.activated,
      ...(args.revealing ? { revealUntil: Date.now() + 60_000 } : {})
    }
  });
  return tiles;
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
  label.textContent = `drawMiniMap() — watchtower at center, activated=${args.activated} revealing=${args.revealing}`;

  const miniMapEl = document.createElement("canvas");
  miniMapEl.width = 300;
  miniMapEl.height = 300;
  miniMapEl.style.border = "1px solid #1f2937";
  miniMapEl.style.borderRadius = "6px";
  const miniMapCtx = miniMapEl.getContext("2d")!;

  const miniMapBase = document.createElement("canvas");
  miniMapBase.width = WORLD;
  miniMapBase.height = WORLD;
  const baseCtx = miniMapBase.getContext("2d")!;
  baseCtx.fillStyle = "#264d2e";
  baseCtx.fillRect(0, 0, WORLD, WORLD);

  const miniMapContentEl = document.createElement("canvas");
  miniMapContentEl.width = 300;
  miniMapContentEl.height = 300;
  const miniMapContentCtx = miniMapContentEl.getContext("2d")!;

  const tiles = buildTiles(args);
  const canvas = { width: 800, height: 800 } as HTMLCanvasElement;
  const miniMapLast = { camX: -1, camY: -1, zoom: -1, replayIndex: -1, tileCount: -1 };

  // A fresh contentCache each frame forces a full recompute every tick, so the watchtower's
  // pulse-ring animation (driven by nowMs inside the content layer) keeps animating smoothly in
  // this always-animating storybook preview, instead of throttling to the ~140ms floor the real
  // game loop uses.
  const draw = (nowMs: number): void => {
    drawMiniMap({
      nowMs,
      state: {
        camX: WORLD / 2,
        camY: WORLD / 2,
        zoom: 4,
        replayActive: false,
        replayIndex: 0,
        replayOwnershipByTile: new Map(),
        fogDisabled: true,
        tiles,
        dockPairs: [],
        shardRainPingsByTile: new Map()
      },
      canvas,
      miniMapEl,
      miniMapCtx,
      miniMapContentEl,
      miniMapContentCtx,
      miniMapBase,
      miniMapBaseReady: true,
      miniMapLast: { ...miniMapLast, tileCount: -1 },
      contentCache: { computedAt: 0 },
      parseKey: (key) => {
        const [x, y] = key.split(",").map(Number);
        return { x: x ?? 0, y: y ?? 0 };
      },
      keyFor: (x, y) => `${x},${y}`,
      tileVisibilityStateAt: () => "visible",
      effectiveOverlayColor: () => "#7fd1ff",
      isDockRouteVisibleForPlayer: () => false,
      hasCollectableYield: () => false,
      replayCurrentEvent: () => undefined
    });
  };

  let rafId = 0;
  const animate = (): void => {
    draw(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();

  root.append(label, miniMapEl);
  (root as HTMLElement & { __cleanup?: () => void }).__cleanup = () => cancelAnimationFrame(rafId);
  return root;
};

const meta: Meta<Args> = {
  title: "2D Library/WatchtowerMinimap",
  parameters: {
    docs: {
      description: {
        component: "Real client-minimap.ts drawMiniMap() output with a watchtower tile placed at the world center."
      }
    }
  },
  argTypes: {
    activated: { control: "boolean" },
    revealing: { control: "boolean" }
  },
  args: { activated: false, revealing: false },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Dormant: Story = {};
export const Activated: Story = { args: { activated: true } };
export const Revealing: Story = { args: { activated: true, revealing: true } };
