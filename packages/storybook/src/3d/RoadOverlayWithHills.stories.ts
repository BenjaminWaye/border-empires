import type { Meta, StoryObj } from "@storybook/html-vite";
import { DirectionalLight } from "three";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createHillTerrain } from "@client/client-map-3d-hills.js";
import { createRoadElevationAt } from "@client/client-map-3d-road-overlay/client-map-3d-road-elevation.js";
import { createRoadOverlay } from "@client/client-map-3d-road-overlay/client-map-3d-road-overlay.js";
import type { RoadOverlayStyle } from "@client/client-map-3d-road-overlay/client-map-3d-road-fragments.js";
import type { RoadDirections } from "@client/client-road-network/client-road-network.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

const CENTER = 100;

type Args = {
  showHill: boolean;
  cameraDistance: number;
  cameraTilt: number;
  style: RoadOverlayStyle;
};

const isHillsAt = (wx: number, wy: number): boolean => {
  const x = wx - CENTER;
  const y = wy - CENTER;
  return x === 0 && y === 0;
};

const neverHills = (): boolean => false;

const tileKindAt = (): HeightfieldTerrainKind => "GRASS";

const render = (args: Args): HTMLElement => {
  const stage = createStage({
    cameraDistance: args.cameraDistance,
    cameraTilt: args.cameraTilt,
    background: "#1a2030"
  });

  const raking = new DirectionalLight("#fff0c0", 1.8);
  raking.position.set(-14, 9, 6);
  stage.scene.add(raking);

  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);
  hf.setGridlinesVisible(true);

  const hillsActive = args.showHill;
  const hillTerrain = createHillTerrain(stage.scene, 512, hf.material);

  // Single road tile spanning the center tile
  const roadTiles: Array<[number, number, RoadDirections]> = [
    [CENTER - 2, CENTER, { east: true }],
    [CENTER - 1, CENTER, { east: true, west: true }],
    [CENTER, CENTER, { east: true, west: true }],
    [CENTER + 1, CENTER, { east: true, west: true }],
    [CENTER + 2, CENTER, { west: true }],
  ];
  const roadDirsByTile = new Map(roadTiles.map(([tx, ty, dirs]) => [`${tx},${ty}`, dirs]));
  const roadDirsAt = (wx: number, wy: number): RoadDirections | undefined => roadDirsByTile.get(`${wx},${wy}`);

  const shared = {
    camX: CENTER,
    camY: CENTER,
    halfW: 6,
    halfH: 6,
    worldWidth: 240,
    worldHeight: 240,
    tileKindAt,
    isHillsAt: hillsActive ? isHillsAt : neverHills
  };
  hf.rebuild(shared);
  if (hillsActive) hillTerrain.rebuild({ ...shared, roadDirsAt });

  const roadOverlay = createRoadOverlay(stage.scene, args.style);

  // Real production path: createRoadElevationAt is exactly what
  // client-map-3d.ts wires up, corridor + road-cut bumps included, so this
  // story can never drift out of sync with it the way a reimplemented copy
  // would.
  const wrap = (n: number): number => ((n % 240) + 240) % 240;
  const elevationAt = createRoadElevationAt(hillsActive ? isHillsAt : neverHills, hf.cornerYAt, wrap, wrap, roadDirsAt);

  for (const [tx, ty, dirs] of roadTiles) {
    roadOverlay.addInstance(tx, ty, tx - CENTER + 0.5, ty - CENTER + 0.5, elevationAt, dirs);
  }
  roadOverlay.commit();

  return wrapWithCleanup(stage, [
    () => { stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines, raking); },
    hf.dispose,
    ...(hillsActive ? [hillTerrain.dispose] : [])
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/RoadOverlay with Hills",
  argTypes: {
    showHill: { control: "boolean" },
    cameraDistance: { control: { type: "range", min: 4, max: 40, step: 2 } },
    cameraTilt: { control: { type: "range", min: 0.05, max: 1.4, step: 0.05 } },
    style: { control: "inline-radio", options: ["dirt", "brick"] }
  },
  args: { showHill: true, cameraDistance: 12, cameraTilt: 0.55, style: "dirt" },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const WithHill: Story = {};
export const WithoutHill: Story = { args: { showHill: false, cameraDistance: 8 } };
