import type { Meta, StoryObj } from "@storybook/html-vite";
import { getWorldSeed, landBiomeAt, setWorldSeed, terrainAt, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createWaterSurface } from "@client/client-map-3d-water-surface.js";
import { createRiverOverlay } from "@client/client-map-3d-rivers/client-map-3d-rivers.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// Unlike every other 3D Library story, rivers are intentionally coupled to
// real world-gen (client-map-3d-rivers.ts reads real terrainAt/landBiomeAt,
// not an injectable pattern) — a river needs an actual coastline and actual
// mountains to path against. So this story drives a real generated world via
// setWorldSeed instead of a hand-authored synthetic pattern.
type Args = {
  seed: number;
  camX: number;
  camY: number;
  halfSpan: number;
  showGridlines: boolean;
  cameraDistance: number;
  cameraTilt: number;
};

const kindAt = (wx: number, wy: number): HeightfieldTerrainKind => {
  const terrain = terrainAt(wx, wy);
  if (terrain === "SEA") return "SEA";
  if (terrain === "COASTAL_SEA") return "COASTAL_SEA";
  if (terrain === "MOUNTAIN") return "MOUNTAIN";
  const biome = landBiomeAt(wx, wy);
  if (biome === "SAND" || biome === "COASTAL_SAND") return "SAND";
  if (biome === "TUNDRA") return "TUNDRA";
  return "GRASS";
};

const render = (args: Args): HTMLElement => {
  setWorldSeed(args.seed);

  const stage = createStage({
    cameraDistance: args.cameraDistance,
    cameraTilt: args.cameraTilt,
    background: "#1a2030"
  });

  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);
  hf.setGridlinesVisible(args.showGridlines);

  hf.rebuild({
    camX: args.camX,
    camY: args.camY,
    halfW: args.halfSpan,
    halfH: args.halfSpan,
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    tileKindAt: kindAt
  });

  const water = createWaterSurface(stage.scene, (args.halfSpan * 2 + 3) ** 2);
  for (let dz = -args.halfSpan - 1; dz <= args.halfSpan + 1; dz += 1) {
    for (let dx = -args.halfSpan - 1; dx <= args.halfSpan + 1; dx += 1) {
      const wx = ((args.camX + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
      const wy = ((args.camY + dz) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
      const kind = kindAt(wx, wy);
      if (kind === "SEA" || kind === "COASTAL_SEA") water.addTile(dx + 0.5, dz + 0.5, kind === "COASTAL_SEA");
    }
  }
  water.commit();

  const rivers = createRiverOverlay(stage.scene);
  rivers.rebuild({ camX: args.camX, camY: args.camY, halfW: args.halfSpan, halfH: args.halfSpan });

  let rafId = 0;
  const start = performance.now();
  const tick = (): void => {
    water.tick(performance.now() - start);
    rafId = requestAnimationFrame(tick);
  };
  tick();

  return wrapWithCleanup(stage, [
    () => { stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines); },
    () => cancelAnimationFrame(rafId),
    water.dispose,
    rivers.dispose,
    hf.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/Rivers",
  parameters: {
    docs: {
      description: {
        component:
          "Purely decorative rivers: a one-time BFS from every sea tile builds a distance-to-coast field per world seed, then each river walks strictly toward the coast from a start tile near a mountain, with a noise tie-break for organic meander. Backed by a real generated world (setWorldSeed) rather than a synthetic pattern, since a river needs a real coastline and real mountains to path against — adjust camX/camY to pan to a different part of the same seed's world, or change the seed to see a different river layout entirely."
      }
    }
  },
  argTypes: {
    seed: { control: { type: "number", min: 0, max: 999999999, step: 1 } },
    camX: { control: { type: "range", min: 0, max: 449, step: 1 } },
    camY: { control: { type: "range", min: 0, max: 449, step: 1 } },
    halfSpan: { control: { type: "range", min: 8, max: 40, step: 1 } },
    showGridlines: { control: "boolean" },
    cameraDistance: { control: { type: "range", min: 10, max: 80, step: 2 } },
    cameraTilt: { control: { type: "range", min: 0.05, max: 1.4, step: 0.05 } }
  },
  args: {
    seed: 555,
    camX: 150,
    camY: 100,
    halfSpan: 20,
    showGridlines: false,
    cameraDistance: 40,
    cameraTilt: 0.6
  },
  render
};

export default meta;
type Story = StoryObj<Args>;

// Seed 555 at (150, 100) was picked by scanning for a window with a
// substantial visible river — rivers are sparse (~10 across the whole
// 450x450 world), so most random seed/camera combinations show nothing.
export const RiverNearMountain: Story = {};

export const WiderView: Story = { args: { halfSpan: 35, cameraDistance: 65 } };

export const DifferentSeed: Story = { args: { seed: 2024, camX: 100, camY: 150, halfSpan: 25, cameraDistance: 50 } };

// Confirms getWorldSeed() reflects whatever setWorldSeed was last called
// with, and that the overlay recomputes for a new seed rather than caching
// forever — pan/seed controls above only work at all because of this.
export const SeedIsLive: Story = {
  render: (args) => {
    setWorldSeed(args.seed);
    return render({ ...args, seed: getWorldSeed() });
  },
  args: { seed: 8080, camX: 100, camY: 50, halfSpan: 25, cameraDistance: 50 }
};
