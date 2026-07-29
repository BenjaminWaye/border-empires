import type { Meta, StoryObj } from "@storybook/html-vite";
import { DirectionalLight } from "three";
import { createHeightfield, type HeightfieldTerrainKind, HEIGHTFIELD_HILLS_ELEVATION_BONUS } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createHillTerrain, domeFalloff } from "@client/client-map-3d-hills.js";
import { createRoadOverlay } from "@client/client-map-3d-road-overlay/client-map-3d-road-overlay.js";
import type { RoadDirections } from "@client/client-road-network/client-road-network.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

const CENTER = 100;

type Args = {
  showHill: boolean;
  cameraDistance: number;
  cameraTilt: number;
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
  if (hillsActive) hillTerrain.rebuild(shared);

  const roadOverlay = createRoadOverlay(stage.scene);

  const elevationAt = (ewx: number, ewz: number): number => {
    const ix = Math.floor(ewx);
    const iz = Math.floor(ewz);
    const fx = ewx - ix;
    const fz = ewz - iz;
    const a = hf.cornerYAt(ix, iz);
    const b = hf.cornerYAt(ix + 1, iz);
    const c = hf.cornerYAt(ix, iz + 1);
    const d = hf.cornerYAt(ix + 1, iz + 1);
    const flatY = (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
    if (hillsActive) {
      const tileX = Math.floor(ewx);
      const tileY = Math.floor(ewz);
      if (isHillsAt(tileX, tileY)) {
        const cx = tileX + 0.5;
        const cy = tileY + 0.5;
        const r = Math.hypot(ewx - cx, ewz - cy);
        return flatY + HEIGHTFIELD_HILLS_ELEVATION_BONUS * domeFalloff(r);
      }
    }
    return flatY;
  };

  // Single road tile spanning the center tile
  const roadTiles: Array<[number, number, RoadDirections]> = [
    [CENTER - 2, CENTER, { east: true }],
    [CENTER - 1, CENTER, { east: true, west: true }],
    [CENTER, CENTER, { east: true, west: true }],
    [CENTER + 1, CENTER, { east: true, west: true }],
    [CENTER + 2, CENTER, { west: true }],
  ];

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
    cameraTilt: { control: { type: "range", min: 0.05, max: 1.4, step: 0.05 } }
  },
  args: { showHill: true, cameraDistance: 12, cameraTilt: 0.55 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const WithHill: Story = {};
export const WithoutHill: Story = { args: { showHill: false, cameraDistance: 8 } };
