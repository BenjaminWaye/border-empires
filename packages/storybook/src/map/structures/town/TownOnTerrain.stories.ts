import type { Meta, StoryObj } from "@storybook/html-vite";
import { Color } from "three";
import { createAtmosphere } from "@client/client-map-3d-atmosphere.js";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createForest } from "@client/client-map-3d-forest.js";
import { createFarmlandOverlay } from "@client/client-map-3d-farmland/client-map-3d-farmland.js";
import { createOwnershipOverlay } from "@client/client-map-3d-ownership-overlay.js";
import { createTownOverlay, type TownTier } from "@client/client-map-3d-town-overlay.js";
import { createFabricationComplexOverlay } from "@client/client-map-3d-fabrication-complex.js";
import { createStage, wrapWithCleanup } from "../../../fixtures/three-stage.js";

// The procedural towns on the real game terrain -- production heightfield,
// atmosphere (sun, fog, building environment map), forests, farmland and the
// settled-territory tint -- seen through the game's fixed camera tilt, so the
// towns can be judged against the map they actually sit on.
const CENTER = 100;
const TIERS: ReadonlyArray<TownTier> = ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"];
const TOWN_DX: Readonly<Record<TownTier, number>> = { SETTLEMENT: -4, TOWN: -2, CITY: 0, GREAT_CITY: 2, METROPOLIS: 4 };
const FOREST_TILES: ReadonlyArray<readonly [number, number]> = [
  [-6, -3], [-5, -3], [-5, -4], [-3, -4], [-1, -3], [0, -4], [1, -4], [3, -3], [5, -4], [6, -3], [6, 2], [-6, 2], [-6, 1]
];
const FARM_TILES: ReadonlyArray<readonly [number, number]> = [[-4, 1], [-2, 1], [-1, 1], [1, 1], [2, 1], [3, 1], [4, 1], [-3, -1]];
const PLAYER = new Color("#3d7fd6");

type Args = {
  showTerritory: boolean;
  /** An AFC behind the row, for comparing the towns' metalwork with it. */
  showAfc: boolean;
  cameraDistance: number;
  cameraTilt: number;
  focus: TownTier;
};

const tileKindAt = (wx: number): HeightfieldTerrainKind => (wx - CENTER >= 6 ? "SAND" : "GRASS");

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: args.cameraTilt, background: "#1a2030" });
  const focusX = TOWN_DX[args.focus] + 0.5;
  stage.camera.position.x += focusX;
  stage.camera.position.z += 0.5;
  stage.camera.lookAt(focusX, 0, 0.5);

  // With the renderer, as in the game, so metalwork gets the building environment map.
  const atmosphere = createAtmosphere(stage.scene, stage.renderer);
  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);
  hf.rebuild({ camX: CENTER, camY: CENTER, halfW: 12, halfH: 10, worldWidth: 240, worldHeight: 240, tileKindAt });
  const cornerY = (dx: number, dz: number): number => hf.cornerYAt(dx + CENTER, dz + CENTER);
  const surfaceYAt = (dx: number, dz: number): number =>
    Math.max(hf.elevationAt(dx + CENTER, dz + CENTER), cornerY(dx, dz), cornerY(dx + 1, dz), cornerY(dx, dz + 1), cornerY(dx + 1, dz + 1));

  const cleanups: Array<() => void> = [() => { stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines); }, atmosphere.dispose, hf.dispose];

  if (args.showTerritory) {
    const territory = createOwnershipOverlay(stage.scene, 64);
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -5; dx <= 5; dx += 1) {
        const lift = 0.004;
        territory.addTile(
          dx, cornerY(dx, dz) + lift, dz, dx + 1, cornerY(dx + 1, dz) + lift, dz,
          dx, cornerY(dx, dz + 1) + lift, dz + 1, dx + 1, cornerY(dx + 1, dz + 1) + lift, dz + 1,
          PLAYER, Math.abs(dz) === 1 && Math.abs(dx) === 5
        );
      }
    }
    territory.commit();
    cleanups.push(territory.dispose);
  }

  const AFC_DX = 0;
  const AFC_DZ = -4;
  if (args.showAfc) {
    const afc = createFabricationComplexOverlay(stage.scene, 1, atmosphere.buildingEnvironmentTexture);
    afc.addInstance(AFC_DX + 0.5, AFC_DZ + 0.5, surfaceYAt(AFC_DX, AFC_DZ), AFC_DX + CENTER, AFC_DZ + CENTER);
    afc.commit();
    afc.update(0);
    cleanups.push(afc.dispose);
  }
  const forestTiles = FOREST_TILES.filter(([dx, dz]) => !args.showAfc || Math.abs(dx - AFC_DX) > 1 || Math.abs(dz - AFC_DZ) > 1);
  const forest = createForest(stage.scene, forestTiles.length);
  for (const [dx, dz] of forestTiles) forest.addInstance(dx + 0.5, dz + 0.5, surfaceYAt(dx, dz), dx + CENTER, dz + CENTER);
  forest.commit();
  cleanups.push(forest.dispose);

  const farms = createFarmlandOverlay(stage.scene, FARM_TILES.length, atmosphere.buildingEnvironmentTexture);
  for (const [dx, dz] of FARM_TILES) farms.addInstance(dx + 0.5, dz + 0.5, surfaceYAt(dx, dz), dx + CENTER, dz + CENTER);
  farms.commit();
  cleanups.push(farms.dispose);

  const towns = createTownOverlay(stage.scene, TIERS.length, atmosphere.buildingEnvironmentTexture);
  for (const tier of TIERS) {
    const dx = TOWN_DX[tier];
    towns.addInstance(dx + 0.5, 0.5, surfaceYAt(dx, 0), tier, dx + CENTER, CENTER);
  }
  towns.commit();
  cleanups.push(towns.dispose);

  return wrapWithCleanup(stage, cleanups);
};

const meta: Meta<Args> = {
  title: "Map/Structures/Town/On Terrain",
  parameters: {
    docs: {
      description: {
        component:
          "The shipped procedural towns (createTownOverlay) on the production terrain, atmosphere, forests, farmland and territory tint, at the game's camera tilt. Left to right: Settlement, Town, City, Great City, Metropolis."
      }
    }
  },
  argTypes: {
    showTerritory: { control: "boolean" },
    showAfc: { control: "boolean" },
    cameraDistance: { control: { type: "range", min: 2, max: 40, step: 0.5 } },
    cameraTilt: { control: { type: "range", min: 0.05, max: 1.4, step: 0.05 } },
    focus: { control: "inline-radio", options: TIERS as unknown as string[] }
  },
  args: { showTerritory: true, showAfc: true, cameraDistance: 12, cameraTilt: 0.6, focus: "CITY" },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Lineup: Story = {};
export const WithAfc: Story = { args: { cameraDistance: 7, cameraTilt: 0.75 } };
// DEFAULT_ZOOM (22) puts the real camera ~38 units out (cameraDistanceForZoom).
export const GameplayZoom: Story = { args: { cameraDistance: 38 } };
export const SettlementCloseUp: Story = { args: { focus: "SETTLEMENT", cameraDistance: 3.2 } };
export const TownCloseUp: Story = { args: { focus: "TOWN", cameraDistance: 3.2 } };
export const CityCloseUp: Story = { args: { focus: "CITY", cameraDistance: 3.4 } };
export const GreatCityCloseUp: Story = { args: { focus: "GREAT_CITY", cameraDistance: 3.6 } };
export const MetropolisCloseUp: Story = { args: { focus: "METROPOLIS", cameraDistance: 4 } };
