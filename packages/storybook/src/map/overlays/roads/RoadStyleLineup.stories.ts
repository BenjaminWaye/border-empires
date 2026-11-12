import type { Meta, StoryObj } from "@storybook/html-vite";
import { DirectionalLight } from "three";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createRoadElevationAt } from "@client/client-map-3d-road-overlay/client-map-3d-road-elevation.js";
import { createRoadOverlay } from "@client/client-map-3d-road-overlay/client-map-3d-road-overlay.js";
import type { RoadOverlayStyle } from "@client/client-map-3d-road-overlay/client-map-3d-road-fragments.js";
import type { RoadDirections } from "@client/client-road-network/client-road-network.js";
import { createStage, wrapWithCleanup } from "../../../fixtures/three-stage.js";

// Side-by-side comparison of road styles on grass: one row per style, each
// with a straight run, a diagonal bend, a three-way junction and end nodes.
const CENTER = 100;
const ROW_SPACING = 3;

type Args = { cameraDistance: number; cameraTilt: number; styles: RoadOverlayStyle[] };

const rowTiles = (y0: number): Array<[number, number, RoadDirections]> => [
  [-3, y0, { east: true, terminal: true }],
  [-2, y0, { east: true, west: true }],
  [-1, y0, { west: true, northeast: true }],
  [0, y0 - 1, { southwest: true, east: true }],
  [1, y0 - 1, { west: true, east: true, south: true }],
  [1, y0, { north: true, terminal: true }],
  [2, y0 - 1, { west: true, east: true }],
  [3, y0 - 1, { west: true, terminal: true }]
];

const tileKindAt = (): HeightfieldTerrainKind => "GRASS";

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: args.cameraTilt, background: "#1a2030" });
  const sun = new DirectionalLight("#fff0c0", 1.8);
  sun.position.set(-14, 9, 6);
  stage.scene.add(sun);

  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);
  hf.setGridlinesVisible(true);
  hf.rebuild({ camX: CENTER, camY: CENTER, halfW: 9, halfH: 9, worldWidth: 240, worldHeight: 240, tileKindAt, isHillsAt: () => false });

  const wrap = (n: number): number => ((n % 240) + 240) % 240;
  const overlays = args.styles.map((style, row) => {
    const y0 = Math.round((row - (args.styles.length - 1) / 2) * ROW_SPACING) + 1;
    const tiles = rowTiles(y0).map(([dx, dy, dirs]) => [CENTER + dx, CENTER + dy, dirs] as const);
    const byTile = new Map(tiles.map(([tx, ty, dirs]) => [`${tx},${ty}`, dirs]));
    const elevationAt = createRoadElevationAt(() => false, hf.cornerYAt, wrap, wrap, (wx, wy) => byTile.get(`${wx},${wy}`));
    const overlay = createRoadOverlay(stage.scene, style);
    for (const [tx, ty, dirs] of tiles) overlay.addInstance(tx, ty, tx - CENTER + 0.5, ty - CENTER + 0.5, elevationAt, dirs);
    overlay.commit();
    return overlay;
  });

  return wrapWithCleanup(stage, [
    () => { stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines, sun); },
    hf.dispose,
    ...overlays.map((o) => o.dispose)
  ]);
};

const meta: Meta<Args> = {
  title: "Map/Overlays/Roads/Style Lineup",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 4, max: 40, step: 1 } },
    cameraTilt: { control: { type: "range", min: 0.05, max: 1.4, step: 0.05 } }
  },
  args: { cameraDistance: 13, cameraTilt: 0.9, styles: ["link", "beam", "trace", "hex"] },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const SciFiCandidates: Story = {};
export const CloseUp: Story = { args: { cameraDistance: 6 } };
export const Link: Story = { args: { cameraDistance: 5, cameraTilt: 0.5, styles: ["link"] } };
export const Beam: Story = { args: { cameraDistance: 5, cameraTilt: 0.5, styles: ["beam"] } };
export const Trace: Story = { args: { cameraDistance: 5, cameraTilt: 0.5, styles: ["trace"] } };
export const Hex: Story = { args: { cameraDistance: 5, cameraTilt: 0.5, styles: ["hex"] } };
