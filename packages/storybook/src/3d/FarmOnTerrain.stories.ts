import type { Meta, StoryObj } from "@storybook/html-vite";
import { createAtmosphere } from "@client/client-map-3d-atmosphere.js";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createHillTerrain } from "@client/client-map-3d-hills.js";
import { createFarmlandOverlay } from "@client/client-map-3d-farmland/client-map-3d-farmland.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// The farmland model placed on the real game terrain: the production heightfield,
// hill domes and atmosphere (sun, fog, environment map), with farm tiles
// laid out the way FARM resource tiles appear in play — a few adjacent
// plots plus scattered singles, one on a hill and one beside sand.
const CENTER = 100;

type Args = {
  showGridlines: boolean;
  cameraDistance: number;
  cameraTilt: number;
};

const FARM_TILES: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0],
  [-6, 3], [5, 4], [-4, -5], [6, -3], [8, 1], [-8, -1]
];
const HILL_TILES: ReadonlyArray<readonly [number, number]> = [[-6, 3], [-5, 3], [-5, 4], [-6, 4]];
const isFarm = (wx: number, wy: number): boolean => FARM_TILES.some(([x, y]) => x + CENTER === wx && y + CENTER === wy);
const isHill = (wx: number, wy: number): boolean => HILL_TILES.some(([x, y]) => x + CENTER === wx && y + CENTER === wy && !isFarm(wx, wy));
const tileKindAt = (wx: number, _wy: number): HeightfieldTerrainKind => (wx - CENTER >= 7 ? "SAND" : "GRASS");

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: args.cameraTilt, background: "#1a2030" });
  const atmosphere = createAtmosphere(stage.scene);
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

  const overlay = createFarmlandOverlay(stage.scene, FARM_TILES.length, atmosphere.buildingEnvironmentTexture);
  for (const [dx, dy] of FARM_TILES) overlay.addInstance(dx + 0.5, dy + 0.5, surfaceYAt(dx + CENTER, dy + CENTER), dx + CENTER, dy + CENTER);
  overlay.commit();
  cleanups.push(overlay.dispose);
  return wrapWithCleanup(stage, cleanups);
};

const meta: Meta<Args> = {
  title: "3D Library/FarmOnTerrain",
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

export const Farmland: Story = {};
