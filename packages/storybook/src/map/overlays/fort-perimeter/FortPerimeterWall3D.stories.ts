import type { Meta, StoryObj } from "@storybook/html-vite";
import { Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import type { FortVariant } from "@border-empires/shared";
import { createFortOverlay } from "@client/client-map-3d-fort-overlay.js";
import { createFortPerimeterWallOverlay3D } from "@client/client-map-3d-fort-perimeter-wall.js";
import type { Tile } from "@client/client-types.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../../../fixtures/three-stage.js";
import { attachSceneLabels } from "../../../fixtures/scene-labels.js";

// Fort perimeter wall (client-fort-perimeter.ts): the low stone wall around
// a fort's tile plus the garrisoned tiles its perimeter defends. Real fort
// models and the real coverage rule; pale tiles are un-garrisoned frontier,
// which the perimeter does not cover, so the wall bends around them.

type Args = { cameraDistance: number };

const LABELS: Record<FortVariant, string> = {
  PALISADE: "Palisade\nradius 1 · ring 1.12x",
  FORT: "Fort\nradius 1 · ring 1.5x",
  TITANIUM_BASTION: "Titanium Bastion\nradius 2 · ring 1.75x",
  THUNDER_BASTION: "Thunder Bastion\nradius 2 · ring 2.1x"
};

// World tiles sit at an offset so the coverage scan never wraps; scene
// position = world - ORIGIN.
const ORIGIN = 100;
const GROUND_RADIUS = 9;

type Placement = { variant: FortVariant; x: number; z: number; frontier: ReadonlyArray<readonly [number, number]> };

const renderScene = (args: Args, placements: readonly Placement[]): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.85, background: "#1d1810" });
  const ground = createGrassGround(GROUND_RADIUS);
  stage.scene.add(ground.group);

  const frontierKeys = new Set(placements.flatMap((p) => p.frontier.map(([dx, dz]) => `${p.x + dx},${p.z + dz}`)));
  const tiles = new Map<string, Tile>();
  for (let z = -GROUND_RADIUS; z <= GROUND_RADIUS; z += 1) {
    for (let x = -GROUND_RADIUS; x <= GROUND_RADIUS; x += 1) {
      const tile: Tile = { x: ORIGIN + x, y: ORIGIN + z, terrain: "LAND", ownerId: "me", ownershipState: frontierKeys.has(`${x},${z}`) ? "FRONTIER" : "SETTLED" };
      tiles.set(`${tile.x},${tile.y}`, tile);
    }
  }
  for (const p of placements) {
    const key = `${ORIGIN + p.x},${ORIGIN + p.z}`;
    tiles.set(key, { ...tiles.get(key)!, fort: { ownerId: "me", status: "active", variant: p.variant } });
  }

  const frontierGeometry = new PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);
  const frontierMaterial = new MeshStandardMaterial({ color: "#d8e6a6", transparent: true, opacity: 0.45 });
  for (const key of frontierKeys) {
    const [x, z] = key.split(",").map(Number);
    const mesh = new Mesh(frontierGeometry, frontierMaterial);
    mesh.position.set(x!, 0.002, z!);
    stage.scene.add(mesh);
  }

  const forts = createFortOverlay(stage.scene, placements.length);
  for (const p of placements) forts.addInstance(p.x, p.z, 0, p.variant, "CLOSED");
  forts.commit();

  const walls = createFortPerimeterWallOverlay3D(stage.scene, 512);
  walls.begin({ tiles, tilesRevision: 1, chunkFullCount: 0 });
  for (const tile of tiles.values()) walls.addTile(tile, tile.x - ORIGIN, tile.y - ORIGIN, 0);
  walls.commit();

  const container = wrapWithCleanup(stage, [forts.dispose, walls.dispose, ground.dispose, () => { frontierGeometry.dispose(); frontierMaterial.dispose(); }]);
  attachSceneLabels(container, stage, placements.map((p) => ({ text: LABELS[p.variant], x: p.x, z: p.z - (p.variant === "PALISADE" || p.variant === "FORT" ? 2 : 3) })));
  return container;
};

const ONE_HOLE: ReadonlyArray<readonly [number, number]> = [[0, 2]];

const single = (variant: FortVariant): Story => ({
  render: (args) => renderScene(args, [{ variant, x: 0, z: 0, frontier: variant === "PALISADE" || variant === "FORT" ? [[1, 1], [0, 2]] : [[-1, 1], [1, -2]] }])
});

const meta: Meta<Args> = {
  title: "Map/Overlays/Fort Perimeter/3D",
  argTypes: { cameraDistance: { control: { type: "range", min: 4, max: 30, step: 0.5 } } },
  args: { cameraDistance: 9 }
};

export default meta;
type Story = StoryObj<Args>;

export const Palisade: Story = single("PALISADE");
export const Fort: Story = single("FORT");
export const TitaniumBastion: Story = single("TITANIUM_BASTION");
export const ThunderBastion: Story = single("THUNDER_BASTION");

export const AllTiers: Story = {
  args: { cameraDistance: 20 },
  render: (args) =>
    renderScene(args, [
      { variant: "PALISADE", x: -5, z: -4, frontier: ONE_HOLE },
      { variant: "FORT", x: 4, z: -4, frontier: [[1, 1]] },
      { variant: "TITANIUM_BASTION", x: -5, z: 5, frontier: [[-1, -2]] },
      { variant: "THUNDER_BASTION", x: 4, z: 5, frontier: [[1, 1]] }
    ])
};
