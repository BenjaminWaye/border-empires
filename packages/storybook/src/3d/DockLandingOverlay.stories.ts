import type { Meta, StoryObj } from "@storybook/html-vite";
import { Color, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry } from "three";
import { createDockLandingGroundOverlay } from "@client/client-map-3d-dock-landing-overlay/client-map-3d-dock-landing-overlay.js";
import { createDockOverlay } from "@client/client-map-3d-dock-overlay.js";
import { createOwnershipOverlay } from "@client/client-map-3d-ownership-overlay.js";
import { createInitialState } from "@client/client-state/client-state.js";
import type { Tile } from "@client/client-types.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

/**
 * The real true-3D dock landing overlay (client-map-3d-dock-landing-overlay),
 * fed by the real client landing rule (client-dock-landing). Two islands
 * across a strait: yours on the west with a dock at (17,15), a rival's on the
 * east with the dock it links to at (26,15). Landing ground is the dock tile
 * plus coastal LAND within 1 tile of it, so the inland tiles beside each dock
 * stay untinted.
 */

type Selection = "none" | "my-dock" | "rival-beach";
type Args = { selection: Selection; rivalIsAlly: boolean; cameraDistance: number };

const ME = "player-1";
const RIVAL = "rival";
const MY_DOCK = { x: 17, y: 15 };
const RIVAL_DOCK = { x: 26, y: 15 };
const CENTRE = { x: 21.5, y: 15 };

const isLand = (x: number, y: number): boolean => {
  // West island x 10-17, east island x 26-33, both y 10-20, with a small cove
  // cut into each so the coast isn't one straight line.
  if (y < 10 || y > 20) return false;
  if (x >= 10 && x <= 17) return !(x === 17 && (y === 12 || y === 18));
  if (x >= 26 && x <= 33) return !(x === 26 && (y === 12 || y === 18));
  return false;
};

const buildTiles = (): Map<string, Tile> => {
  const tiles = new Map<string, Tile>();
  for (let y = 7; y <= 23; y += 1) {
    for (let x = 7; x <= 36; x += 1) {
      const land = isLand(x, y);
      const tile: Tile = { x, y, terrain: land ? "LAND" : "SEA" };
      if (land) {
        tile.ownerId = x <= 17 ? ME : RIVAL;
        tile.ownershipState = "SETTLED";
      }
      tiles.set(`${x},${y}`, tile);
    }
  }
  tiles.get(`${MY_DOCK.x},${MY_DOCK.y}`)!.dockId = "dock-a";
  tiles.get(`${RIVAL_DOCK.x},${RIVAL_DOCK.y}`)!.dockId = "dock-b";
  return tiles;
};

const LAND_COLOR = new Color("#6f8a4a");
const SEA_COLOR = new Color("#24506e");
const MY_COLOR = new Color("#3fa9f5");
const RIVAL_COLOR = new Color("#e5484d");

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.85, background: "#0f1a26" });
  const tiles = buildTiles();

  // Flat terrain squares, one instance per tile.
  const ground = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshStandardMaterial({ roughness: 0.9 }), tiles.size);
  const matrix = new Matrix4();
  let index = 0;
  for (const tile of tiles.values()) {
    matrix.makeTranslation(tile.x - CENTRE.x, 0, tile.y - CENTRE.y);
    ground.setMatrixAt(index, matrix);
    ground.setColorAt(index, tile.terrain === "LAND" ? LAND_COLOR : SEA_COLOR);
    index += 1;
  }
  stage.scene.add(ground);

  const ownership = createOwnershipOverlay(stage.scene, tiles.size);
  for (const tile of tiles.values()) {
    if (!tile.ownerId) continue;
    const x0 = tile.x - CENTRE.x - 0.5;
    const z0 = tile.y - CENTRE.y - 0.5;
    ownership.addTile(x0, 0.002, z0, x0 + 1, 0.002, z0, x0, 0.002, z0 + 1, x0 + 1, 0.002, z0 + 1, tile.ownerId === ME ? MY_COLOR : RIVAL_COLOR, false);
  }
  ownership.commit();

  const docks = createDockOverlay(stage.scene, 2);
  // Modelled facing +z; turn each pier toward the strait.
  docks.addInstance(MY_DOCK.x - CENTRE.x, MY_DOCK.y - CENTRE.y, 0, Math.PI / 2, MY_DOCK.x, MY_DOCK.y);
  docks.addInstance(RIVAL_DOCK.x - CENTRE.x, RIVAL_DOCK.y - CENTRE.y, 0, -Math.PI / 2, RIVAL_DOCK.x, RIVAL_DOCK.y);
  docks.commit();

  const state = createInitialState();
  state.me = ME;
  state.tiles = tiles;
  state.dockPairs = [{ ax: MY_DOCK.x, ay: MY_DOCK.y, bx: RIVAL_DOCK.x, by: RIVAL_DOCK.y }];
  state.allies = args.rivalIsAlly ? [RIVAL] : [];
  state.serverReach = new Set([...tiles.values()].filter((tile) => tile.ownerId === ME).map((tile) => `${tile.x},${tile.y}`));
  state.serverReachRevision = 1;
  state.selected = args.selection === "my-dock" ? MY_DOCK : args.selection === "rival-beach" ? { x: 26, y: 16 } : undefined;

  const landing = createDockLandingGroundOverlay(stage.scene);
  // The overlay places tiles at (world - camera + 0.5); offset the camera so they line up with the squares above.
  const deps = {
    state,
    keyFor: (x: number, y: number) => `${x},${y}`,
    wrapX: (x: number) => x,
    wrapY: (y: number) => y,
    tileVisibilityStateAt: () => "visible" as const,
    sceneOrigin: { camX: CENTRE.x + 0.5, camY: CENTRE.y + 0.5 },
    cornerYAt: () => 0
  };
  let rafId = 0;
  const animate = (): void => {
    landing.sync(deps);
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    landing.dispose,
    docks.dispose,
    ownership.dispose,
    () => {
      stage.scene.remove(ground);
      ground.geometry.dispose();
      (ground.material as MeshStandardMaterial).dispose();
    }
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/DockLandingOverlay",
  parameters: {
    docs: {
      description: {
        component:
          "Beach landings on the true-3D map. Always on: your coast is tinted warning orange wherever a dock held by a hostile " +
          "player can land on it (allies and live truce partners don't count). Selecting a dock tints the landing ground at both " +
          "ends of its sea lanes in sea-foam; selecting a beach shows its harbour's landing ground. Real client code: " +
          "hostileLandingGroundKeys + landingGroundKeysForSelection → createDockLandingGroundOverlay."
      }
    }
  },
  argTypes: {
    selection: { control: "inline-radio", options: ["none", "my-dock", "rival-beach"] },
    rivalIsAlly: { control: "boolean" },
    cameraDistance: { control: { type: "range", min: 8, max: 40, step: 1 } }
  },
  args: { selection: "none", rivalIsAlly: false, cameraDistance: 22 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const HostileCoast: Story = {
  parameters: { docs: { description: { story: "Nothing selected. The rival holds the far dock, so the landing ground on your side of the strait is tinted orange." } } }
};
export const SelectMyDock: Story = {
  args: { selection: "my-dock" },
  parameters: { docs: { description: { story: "Your dock selected: sea-foam on its own shore and on the far dock's landing ground, where your crossings can come ashore." } } }
};
export const SelectRivalBeach: Story = {
  args: { selection: "rival-beach" },
  parameters: { docs: { description: { story: "A beach beside the rival dock selected: its harbour's landing ground is shown." } } }
};
export const AlliedRival: Story = {
  args: { rivalIsAlly: true },
  parameters: { docs: { description: { story: "The far dock's owner is an ally, so no orange warning is drawn." } } }
};
