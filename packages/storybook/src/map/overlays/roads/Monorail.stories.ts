import type { Meta, StoryObj } from "@storybook/html-vite";
import { Color, DirectionalLight } from "three";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createHillTerrain } from "@client/client-map-3d-hills.js";
import { createMonorailRoadOverlay } from "@client/client-map-3d-monorail/client-map-3d-monorail.js";
import { OPPOSITE_DIR, ROAD_DIRS, ROAD_STEP } from "@client/client-map-3d-road-overlay/client-map-3d-road-centerline.js";
import { createRoadElevationAt } from "@client/client-map-3d-road-overlay/client-map-3d-road-elevation.js";
import { createTownOverlay, type TownTier } from "@client/client-map-3d-town-overlay.js";
import type { RoadDirections } from "@client/client-road-network/client-road-network.js";
import { createStage, wrapWithCleanup } from "../../../fixtures/three-stage.js";

// The shipped town-link monorail on a small network: three towns, a bend, a
// diagonal run, a junction and (optionally) a hill the line climbs over. Drives
// the real overlay through the same clear / addInstance / commit / update
// lifecycle client-map-3d.ts uses.
const CENTER = 100;
const WORLD = 240;
type Args = { cameraDistance: number; cameraTilt: number; showHill: boolean };

const TOWNS: Array<[number, number, TownTier]> = [[-4, 0, "CITY"], [4, -2, "TOWN"], [1, 3, "TOWN"]];
const ROUTES: Array<Array<[number, number]>> = [
  [[-4, 0], [-3, 0], [-2, 0], [-1, 0], [0, -1], [1, -1]],
  [[1, -1], [2, -1], [3, -2], [4, -2]],
  [[1, -1], [1, 0], [1, 1], [1, 2], [1, 3]]
];
const HILL: [number, number] = [-2, 0];
const OWNER = new Color("#d9534f");

const buildRoads = (): Map<string, RoadDirections> => {
  const roads = new Map<string, RoadDirections>();
  const link = (x: number, y: number, dir: (typeof ROAD_DIRS)[number]): void => {
    const key = `${CENTER + x},${CENTER + y}`;
    roads.set(key, { ...roads.get(key), [dir]: true });
  };
  for (const route of ROUTES) {
    for (let i = 1; i < route.length; i += 1) {
      const [ax, ay] = route[i - 1]!, [bx, by] = route[i]!;
      const dir = ROAD_DIRS.find((d) => ROAD_STEP[d][0] === bx - ax && ROAD_STEP[d][1] === by - ay)!;
      link(ax, ay, dir);
      link(bx, by, OPPOSITE_DIR[dir]);
    }
  }
  for (const [x, y] of TOWNS) {
    const key = `${CENTER + x},${CENTER + y}`;
    roads.set(key, { ...roads.get(key), terminal: true });
  }
  return roads;
};

const tileKindAt = (): HeightfieldTerrainKind => "GRASS";

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: args.cameraTilt, background: "#1a2030" });
  const sun = new DirectionalLight("#fff0c0", 1.8);
  sun.position.set(-14, 9, 6);
  stage.scene.add(sun);

  const isHillsAt = (wx: number, wy: number): boolean => args.showHill && wx === CENTER + HILL[0] && wy === CENTER + HILL[1];
  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);
  hf.setGridlinesVisible(true);
  const roads = buildRoads();
  const roadDirsAt = (wx: number, wy: number): RoadDirections | undefined => roads.get(`${wx},${wy}`);
  const window = { camX: CENTER, camY: CENTER, halfW: 9, halfH: 9 };
  const shared = { ...window, worldWidth: WORLD, worldHeight: WORLD, tileKindAt, isHillsAt };
  hf.rebuild(shared);
  const hills = createHillTerrain(stage.scene, 64, hf.material);
  hills.rebuild({ ...shared, roadDirsAt });

  const wrap = (n: number): number => ((n % WORLD) + WORLD) % WORLD;
  const elevationAt = createRoadElevationAt(isHillsAt, hf.cornerYAt, wrap, wrap, roadDirsAt);

  const towns = createTownOverlay(stage.scene, 8);
  towns.clear();
  for (const [x, y, tier] of TOWNS) towns.addInstance(x + 0.5, y + 0.5, elevationAt(CENTER + x + 0.5, CENTER + y + 0.5), tier, CENTER + x, CENTER + y);
  towns.commit();

  const monorail = createMonorailRoadOverlay(stage.scene, { wrapX: wrap, wrapY: wrap, ownerColorAt: () => OWNER });
  monorail.clear(window, roadDirsAt);
  for (const [key, dirs] of roads) {
    const [wx, wy] = key.split(",").map(Number) as [number, number];
    monorail.addInstance(wx, wy, wx - CENTER + 0.5, wy - CENTER + 0.5, elevationAt, dirs);
  }
  monorail.commit();
  hf.mesh.onBeforeRender = () => monorail.update(performance.now());

  return wrapWithCleanup(stage, [
    () => { stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines, sun); },
    hf.dispose, hills.dispose, towns.dispose, monorail.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "Map/Overlays/Roads/Monorail",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 40, step: 0.5 } },
    cameraTilt: { control: { type: "range", min: 0.05, max: 1.4, step: 0.05 } },
    showHill: { control: "boolean" }
  },
  args: { cameraDistance: 9, cameraTilt: 0.6, showHill: true },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Network: Story = {};
export const CloseUp: Story = { args: { cameraDistance: 3.5, cameraTilt: 0.85 } };
export const GameZoomedOut: Story = { args: { cameraDistance: 16 } };
