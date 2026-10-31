import type { Meta, StoryObj } from "@storybook/html-vite";
import { ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, Light, PCFShadowMap, SRGBColorSpace } from "three";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createHillTerrain } from "@client/client-map-3d-hills.js";
import { createWaterSurface } from "@client/client-map-3d-water-surface.js";
import { createOwnershipOverlay } from "@client/client-map-3d-ownership-overlay.js";
import { OWNERSHIP_RISE_ABOVE_HEIGHTFIELD, OWNERSHIP_SHORE_EDGE_OPACITY } from "@client/client-map-3d-ownership-shore.js";
import { DEFAULT_LIGHTING, SUN_DISTANCE } from "@client/client-lighting-tuner/client-lighting-tuner-settings.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

// A whole island under the game's own lighting rig (DEFAULT_LIGHTING, ACES,
// sun shadows) rather than the generic preview rig -- the place to judge the
// coastline and beach shading the way players actually see it. Patterns sit at a
// real in-range coordinate (CENTER), not around (0, 0): the heightfield
// wraps negative world coords, see HillsOnTerrain.stories.ts.
const CENTER = 100;
const HALF = 18;

type Args = {
  cameraDistance: number;
  cameraTilt: number;
  // Scene point (tiles from the island center) the camera looks at.
  focusX: number;
  focusZ: number;
  // Two empires' territory over the coast (west settled, east with a
  // frontier rim), to judge how ownership meets the beach fringe.
  ownership: boolean;
};

const WEST_OWNER = new Color("#d0453a");
const EAST_OWNER = new Color("#3a6fd0");

const hash = (x: number, y: number): number => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

// Lumpy island: a radial falloff wobbled by low-frequency sines so the coast
// is irregular. Deterministic, so screenshots are comparable across runs.
const islandRadiusAt = (x: number, y: number): number =>
  Math.hypot(x, y * 1.15) + Math.sin(x * 0.45) * 1.6 + Math.cos(y * 0.38 + 1.2) * 1.4;

const tileKindAt = (wx: number, wy: number): HeightfieldTerrainKind => {
  const x = wx - CENTER;
  const y = wy - CENTER;
  const r = islandRadiusAt(x, y);
  if (r > 15) return "SEA";
  if (r > 13) return "COASTAL_SEA";
  if (r > 11.2) return "SAND";
  if (y < -6 && x < 2) return hash(wx, wy) > 0.8 ? "SNOW" : "TUNDRA";
  if (x > 5 && y > 1) return "PLAINS";
  if (x < -6 && y > 4) return "JUNGLE";
  if (x > 4 && y < -4) return "MARSH";
  if (Math.abs(x) <= 1 && Math.abs(y) <= 1) return "MOUNTAIN";
  return "GRASS";
};

const isHillsAt = (wx: number, wy: number): boolean => {
  const x = wx - CENTER;
  const y = wy - CENTER;
  if (islandRadiusAt(x, y) > 10) return false;
  return (x <= -3 && x >= -6 && y >= 1 && y <= 4) || (x === 4 && y === -3);
};

const isForestAt = (wx: number, wy: number): boolean => {
  const x = wx - CENTER;
  const y = wy - CENTER;
  return x >= 2 && x <= 5 && y >= 4 && y <= 7;
};

const applyGameLighting = (stage: ReturnType<typeof createStage>): (() => void) => {
  const previewLights: Light[] = [];
  stage.scene.traverse((object) => {
    if (object instanceof Light) previewLights.push(object);
  });
  stage.scene.remove(...previewLights);

  const lighting = DEFAULT_LIGHTING;
  const hemi = new HemisphereLight(lighting.hemiSkyColor, lighting.hemiGroundColor, lighting.hemiIntensity);
  const sun = new DirectionalLight(lighting.sunColor, lighting.sunIntensity);
  const azimuth = (lighting.sunAzimuthDeg * Math.PI) / 180;
  const elevation = (lighting.sunElevationDeg * Math.PI) / 180;
  const horizontal = Math.cos(elevation) * SUN_DISTANCE;
  sun.position.set(Math.sin(azimuth) * horizontal, Math.sin(elevation) * SUN_DISTANCE, Math.cos(azimuth) * horizontal);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.intensity = lighting.shadowIntensity;
  // Same biases as client-map-3d-atmosphere.ts: the hill domes cast onto
  // themselves, and without these they darken with shadow acne.
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.05;
  sun.shadow.camera.left = -HALF;
  sun.shadow.camera.right = HALF;
  sun.shadow.camera.top = HALF;
  sun.shadow.camera.bottom = -HALF;
  sun.shadow.camera.far = SUN_DISTANCE * 2;
  const fill = new DirectionalLight(lighting.fillColor, lighting.fillIntensity);
  fill.position.set(-30, 20, -40);
  stage.scene.add(hemi, sun, fill);

  stage.renderer.outputColorSpace = SRGBColorSpace;
  stage.renderer.toneMapping = ACESFilmicToneMapping;
  stage.renderer.toneMappingExposure = lighting.exposure;
  stage.renderer.shadowMap.enabled = true;
  stage.renderer.shadowMap.type = PCFShadowMap;
  return () => {
    stage.scene.remove(hemi, sun, fill);
  };
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: args.cameraTilt, background: "#3a3e44" });
  const removeLighting = applyGameLighting(stage);
  stage.camera.position.x += args.focusX;
  stage.camera.position.z += args.focusZ;
  stage.camera.lookAt(args.focusX, 0, args.focusZ);

  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.skirtMesh);
  hf.setGridlinesVisible(false);
  const hillTerrain = createHillTerrain(stage.scene, 512, hf.material);
  const shared = { camX: CENTER, camY: CENTER, halfW: HALF, halfH: HALF, worldWidth: 240, worldHeight: 240, tileKindAt };
  hf.rebuild({ ...shared, isHillsAt, isForestAt });
  hillTerrain.rebuild({ ...shared, isHillsAt });

  const ownership = createOwnershipOverlay(stage.scene, (HALF * 2 + 1) ** 2);
  // isLandAt + shoreSand drive the calm shoreline, shore foam and soft
  // beach fringe, wired as in the game (client-map-3d-water-wiring.ts).
  const water = createWaterSurface(stage.scene, (HALF * 2 + 1) ** 2, {
    isLandAt: (wx, wz) => {
      const kind = tileKindAt(wx, wz);
      return kind !== "SEA" && kind !== "COASTAL_SEA";
    },
    shoreSand: { material: hf.material, cornerAt: hf.cornerAttributesAt, onFringe: (fringe) => ownership.extendOntoShore(fringe, OWNERSHIP_SHORE_EDGE_OPACITY) }
  });
  for (let wy = CENTER - HALF; wy <= CENTER + HALF; wy += 1) {
    for (let wx = CENTER - HALF; wx <= CENTER + HALF; wx += 1) {
      const kind = tileKindAt(wx, wy);
      if (kind === "SEA" || kind === "COASTAL_SEA") {
        water.addTile(wx - CENTER + 0.5, wy - CENTER + 0.5, kind === "COASTAL_SEA", wx, wy);
      }
    }
  }
  if (args.ownership) {
    for (let wy = CENTER - HALF; wy <= CENTER + HALF; wy += 1) {
      for (let wx = CENTER - HALF; wx <= CENTER + HALF; wx += 1) {
        const kind = tileKindAt(wx, wy);
        if (kind === "SEA" || kind === "COASTAL_SEA" || isHillsAt(wx, wy)) continue;
        const x = wx - CENTER;
        const y = wy - CENTER;
        const west = x < 0;
        const frontier = !west && islandRadiusAt(x, y) > 10;
        const cy = (cx: number, cz: number): number => hf.cornerYAt(cx, cz) + OWNERSHIP_RISE_ABOVE_HEIGHTFIELD;
        ownership.addTile(
          x, cy(wx, wy), y,
          x + 1, cy(wx + 1, wy), y,
          x, cy(wx, wy + 1), y + 1,
          x + 1, cy(wx + 1, wy + 1), y + 1,
          west ? WEST_OWNER : EAST_OWNER,
          frontier
        );
      }
    }
  }
  ownership.commit();
  water.commit();
  const start = performance.now();
  let rafId = 0;
  const tickWater = (): void => {
    water.tick(performance.now() - start);
    rafId = requestAnimationFrame(tickWater);
  };
  tickWater();

  return wrapWithCleanup(stage, [
    () => { cancelAnimationFrame(rafId); },
    () => { stage.scene.remove(hf.mesh, hf.skirtMesh); },
    removeLighting,
    water.dispose,
    ownership.dispose,
    hillTerrain.dispose,
    hf.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "Map/Terrain/TerrainShowcase",
  parameters: {
    docs: {
      description: {
        component:
          "A mixed island (grass, plains, jungle, marsh, tundra/snow, beach, coast, hills, a forest halo) lit with the game's shipped lighting rig, tone mapping and sun shadows — for judging the coastline, beaches and (OwnedCoast) how territory colour meets them, as players see it."
      }
    }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 6, max: 60, step: 1 } },
    cameraTilt: { control: { type: "range", min: 0.2, max: 1.4, step: 0.05 } },
    focusX: { control: { type: "range", min: -HALF, max: HALF, step: 1 } },
    focusZ: { control: { type: "range", min: -HALF, max: HALF, step: 1 } }
  },
  args: { cameraDistance: 30, cameraTilt: 0.6, focusX: 0, focusZ: 0, ownership: false },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Island: Story = {};
export const CloseUp: Story = { args: { cameraDistance: 11, cameraTilt: 0.75 } };
export const Shoreline: Story = { args: { cameraDistance: 8, cameraTilt: 0.75, focusX: -12, focusZ: 3 } };
export const OwnedCoast: Story = { args: { cameraDistance: 14, cameraTilt: 0.8, focusX: 0, focusZ: 8, ownership: true } };
