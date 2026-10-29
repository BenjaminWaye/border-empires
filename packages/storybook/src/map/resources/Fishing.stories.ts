import type { Meta, StoryObj } from "@storybook/html-vite";
import { createResourcePreviewAtmosphere } from "../../fixtures/resource-preview-atmosphere.js";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createHillTerrain } from "@client/client-map-3d-hills.js";
import { createFishingOverlay, fishingWaterDirection } from "@client/client-map-3d-fishing/client-map-3d-fishing.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

// The fish-basin model placed on the real game terrain: the production heightfield,
// hill domes and atmosphere (sun, fog, environment map), with fishing tiles
// laid out the way FISH resource tiles appear in play — a few adjacent
// sites facing each shore of a lake, plus one inland. The smaller site has a clean gray apron and moves toward adjacent water.
const CENTER = 100;

type Args = {
  showGridlines: boolean;
  cameraDistance: number;
  cameraTilt: number;
};

// Beach sites on a lake shore, one per shoreline direction plus a corner
// (two water sides) and an inland one with no water nearby.
const FISH_TILES: ReadonlyArray<readonly [number, number]> = [
  [6, 0], [-6, 0], [0, 5], [0, -5], [6, 5], [-6, -5], [6, -2], [-6, 3], [2, 5], [-3, -5], [0, 0]
];
const HILL_TILES: ReadonlyArray<readonly [number, number]> = [];
const isFish = (wx: number, wy: number): boolean => FISH_TILES.some(([x, y]) => x + CENTER === wx && y + CENTER === wy);
const isHill = (wx: number, wy: number): boolean => HILL_TILES.some(([x, y]) => x + CENTER === wx && y + CENTER === wy && !isFish(wx, wy));
const isWater = (wx: number, wy: number): boolean => Math.abs(wx - CENTER) >= 7 || Math.abs(wy - CENTER) >= 6;
const tileKindAt = (wx: number, wy: number): HeightfieldTerrainKind => (isWater(wx, wy) ? "SEA" : Math.abs(wx - CENTER) === 6 || Math.abs(wy - CENTER) === 5 ? "SAND" : "GRASS");

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: args.cameraTilt, background: "#1a2030" });
  const atmosphere = createResourcePreviewAtmosphere(stage.scene, stage.renderer);
  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);
  hf.setGridlinesVisible(args.showGridlines);
  const hills = createHillTerrain(stage.scene, 512, hf.material);
  const shared = { camX: CENTER, camY: CENTER, halfW: 12, halfH: 12, worldWidth: 240, worldHeight: 240, tileKindAt, isHillsAt: isHill };
  hf.rebuild(shared);
  hills.rebuild(shared);

  const surfaceYAt = (wx: number, wy: number): number =>
    Math.max(hf.elevationAt(wx, wy), hf.cornerYAt(wx, wy), hf.cornerYAt(wx + 1, wy), hf.cornerYAt(wx, wy + 1), hf.cornerYAt(wx + 1, wy + 1));

  const cleanups: Array<() => void> = [
    () => { stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines); },
    atmosphere.dispose, hf.dispose, hills.dispose
  ];

  const overlay = createFishingOverlay(stage.scene, FISH_TILES.length, atmosphere.buildingEnvironmentTexture, hf.cornerYAt);
  for (const [dx, dy] of FISH_TILES) overlay.addInstance(dx + 0.5, dy + 0.5, surfaceYAt(dx + CENTER, dy + CENTER), dx + CENTER, dy + CENTER, fishingWaterDirection(isWater, dx + CENTER, dy + CENTER));
  overlay.commit();
  cleanups.push(overlay.dispose);
  return wrapWithCleanup(stage, cleanups);
};

const meta: Meta<Args> = {
  title: "Map/Resources/Fishing",
  argTypes: {
    showGridlines: { control: "boolean" },
    cameraDistance: { control: { type: "range", min: 4, max: 40, step: 1 } },
    cameraTilt: { control: { type: "range", min: 0.05, max: 1.4, step: 0.05 } }
  },
  args: { showGridlines: true, cameraDistance: 12, cameraTilt: 0.6 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Fishing: Story = {};

export const BasinDetail: Story = {
  render: () => {
    const stage = createStage({ cameraDistance: 1.7, cameraTilt: 0.85, background: "#202c29" });
    stage.camera.position.set(1.1, 1.15, 1.4);
    stage.camera.lookAt(0, 0.12, 0);
    const atmosphere = createResourcePreviewAtmosphere(stage.scene, stage.renderer);
    const overlay = createFishingOverlay(stage.scene, 1, atmosphere.buildingEnvironmentTexture);
    overlay.addInstance(0, 0, 0, 100, 100, { dx: 1, dy: 0 });
    overlay.commit();
    return wrapWithCleanup(stage, [overlay.dispose, atmosphere.dispose]);
  }
};
