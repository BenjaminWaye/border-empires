import type { Meta, StoryObj } from "@storybook/html-vite";
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry } from "three";
import { harbourFacingAt, rotationForFacing, slipwayPlacementsFor } from "@client/client-harbour-slipways/client-harbour-slipways.js";
import { clientTerrainAt } from "@client/client-dock-landing-ground/client-dock-landing-ground.js";
import { createDockOverlay } from "@client/client-map-3d-dock-overlay.js";
import { drawSlipways2D } from "@client/client-harbour-slipways/client-harbour-slipways-2d.js";
import type { DockPair, Tile } from "@client/client-types.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

/**
 * The real 3D harbour (client-map-3d-dock-overlay.ts) placed by the real
 * slipway rule (client-harbour-slipways.ts): a quay on each dock tile and a
 * landing slipway on every beach of its landing ground, each turned to face
 * its own water. Two islands across a strait show every facing -- docks on an
 * east, a west and a north coast -- and a beach with a resource on it, where
 * the slipway shrinks to the waterline.
 */

type Args = { renderer: "3d" | "2d"; cameraDistance: number; cameraTilt: number; focus: "all" | "east-coast" | "north-coast" };

const isLand = (x: number, y: number): boolean => {
  if (y < 3 || y > 13) return false;
  return (x >= 2 && x <= 8) || (x >= 15 && x <= 21);
};

const DOCK_PAIRS: DockPair[] = [
  { ax: 8, ay: 5, bx: 15, by: 9 },
  { ax: 8, ay: 11, bx: 18, by: 3 }
];

const buildTiles = (): Map<string, Tile> => {
  const tiles = new Map<string, Tile>();
  for (let y = 0; y <= 16; y += 1) {
    for (let x = 0; x <= 23; x += 1) tiles.set(`${x},${y}`, { x, y, terrain: isLand(x, y) ? "LAND" : "SEA" });
  }
  for (const pair of DOCK_PAIRS) {
    tiles.get(`${pair.ax},${pair.ay}`)!.dockId = `dock-${pair.ax}-${pair.ay}`;
    tiles.get(`${pair.bx},${pair.by}`)!.dockId = `dock-${pair.bx}-${pair.by}`;
  }
  // A worked beach beside the south-west dock: its slipway shrinks to the waterline.
  tiles.get("8,12")!.resource = "FISH";
  return tiles;
};

const FOCUS: Record<Args["focus"], { x: number; y: number }> = {
  all: { x: 11.5, y: 8 },
  "east-coast": { x: 8, y: 5 },
  "north-coast": { x: 18, y: 3 }
};

const LAND = new Color("#7d8f55");
const SEA = new Color("#2a5a78");

// The 2D canvas map: flat terrain, a stand-in square on each dock (the real
// 2D map draws painted dock art there) and the real 2D slipways.
const render2D = (): HTMLElement => {
  const tiles = buildTiles();
  const size = 36;
  const canvas = document.createElement("canvas");
  canvas.width = 24 * size;
  canvas.height = 17 * size;
  const ctx = canvas.getContext("2d")!;
  for (const tile of tiles.values()) {
    ctx.fillStyle = tile.terrain === "LAND" ? "#7d8f55" : "#2a5a78";
    ctx.fillRect(tile.x * size, tile.y * size, size, size);
  }
  ctx.fillStyle = "#a08b5c";
  ctx.fillRect(8 * size + 4, 12 * size + 4, size * 0.4, size * 0.4);
  for (const pair of DOCK_PAIRS) {
    for (const [x, y] of [[pair.ax, pair.ay], [pair.bx, pair.by]] as const) {
      ctx.fillStyle = "#4a3524";
      ctx.fillRect(x * size + size * 0.2, y * size + size * 0.2, size * 0.6, size * 0.6);
    }
  }
  drawSlipways2D(ctx, { dockPairs: DOCK_PAIRS, tiles }, {
    tileCenter: (x, y) => ({ sx: x * size + size / 2, sy: y * size + size / 2 }),
    size,
    viewportWidth: canvas.width,
    viewportHeight: canvas.height,
    tileVisible: () => true
  });
  return canvas;
};

const render = (args: Args): HTMLElement => {
  if (args.renderer === "2d") return render2D();
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: args.cameraTilt, background: "#0f1a26" });
  const tiles = buildTiles();
  const centre = FOCUS[args.focus];
  const sceneX = (x: number) => x - centre.x;
  const sceneZ = (y: number) => y - centre.y;

  const ground = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshStandardMaterial({ roughness: 0.95 }), tiles.size);
  const matrix = new Matrix4();
  let index = 0;
  for (const tile of tiles.values()) {
    // Water sits a little below the land, as on the real heightfield.
    matrix.makeTranslation(sceneX(tile.x), tile.terrain === "LAND" ? 0 : -0.06, sceneZ(tile.y));
    ground.setMatrixAt(index, matrix);
    ground.setColorAt(index, tile.terrain === "LAND" ? LAND : SEA);
    index += 1;
  }
  stage.scene.add(ground);

  // Stand-in for the resource works on the shrunk-slipway beach.
  const works = new InstancedMesh(new BoxGeometry(0.34, 0.2, 0.34), new MeshStandardMaterial({ color: "#a08b5c", roughness: 0.8 }), 1);
  works.setMatrixAt(0, new Matrix4().makeTranslation(sceneX(8) - 0.12, 0.1, sceneZ(12) - 0.05));
  stage.scene.add(works);

  const harbour = createDockOverlay(stage.scene, 32);
  const docks = new Set(DOCK_PAIRS.flatMap((pair) => [`${pair.ax},${pair.ay}`, `${pair.bx},${pair.by}`]));
  for (const key of docks) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    harbour.addInstance(sceneX(x), sceneZ(y), 0.02, rotationForFacing(harbourFacingAt(clientTerrainAt(tiles), x, y)), x, y);
  }
  for (const slipway of slipwayPlacementsFor({ dockPairs: DOCK_PAIRS, tiles }).values()) {
    harbour.addSlipway(sceneX(slipway.x), sceneZ(slipway.y), 0.02, rotationForFacing(slipway.facing), slipway.fit);
  }
  harbour.commit();

  return wrapWithCleanup(stage, [
    harbour.dispose,
    () => {
      for (const mesh of [ground, works]) {
        stage.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
      }
    }
  ]);
};

const meta: Meta<Args> = {
  title: "Map/Structures/Harbour",
  parameters: {
    docs: {
      description: {
        component:
          "The harbour on the true-3D map. A dock tile carries the quay: stone quay and timber pier, toll and harbourmaster's " +
          "house, a coal-fired steam derrick, a harbour lamp and a paddle-steamer ferry. Each beach a sea crossing can land on " +
          "(the dock's landing ground) carries a landing slipway: a ramp into the water with a landing barge hauled up it, a " +
          "winch, a lantern and supplies landed by sea. Where a beach already holds something, the slipway shrinks to the " +
          "waterline; a town, natural wonder or AFC hides it. Frontier machinery is steam and iron, no aether (world bible §4)."
      }
    }
  },
  argTypes: {
    renderer: { control: "inline-radio", options: ["3d", "2d"] },
    cameraDistance: { control: { type: "range", min: 2, max: 30, step: 0.5 } },
    cameraTilt: { control: { type: "range", min: 0.3, max: 1.4, step: 0.05 } },
    focus: { control: "inline-radio", options: ["all", "east-coast", "north-coast"] }
  },
  args: { renderer: "3d", cameraDistance: 18, cameraTilt: 0.8, focus: "all" },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Overview: Story = {};
export const EastCoastCloseUp: Story = { args: { focus: "east-coast", cameraDistance: 4.5, cameraTilt: 0.7 } };
export const NorthCoastCloseUp: Story = { args: { focus: "north-coast", cameraDistance: 4.5, cameraTilt: 0.7 } };
export const Map2D: Story = { args: { renderer: "2d" } };
