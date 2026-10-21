import type { Meta, StoryObj } from "@storybook/html-vite";
import { createForest, tileHash } from "@client/client-map-3d-forest.js";
import { createTropicalForest } from "@client/client-map-3d-tropical-forest.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";

// Close-up of the hand-built tree models (client-map-3d-tree-models.ts): one
// forest tile per species, left to right pine, spruce, leaf, tropical palm,
// with a lone light-grass sapling in front. Watch for a few seconds to see
// the wind sway (client-map-3d-tree-material.ts).

type Args = {
  zoom: number;
  cameraTilt: number;
};

const SPECIES_SALT = 11; // createForest picks species with tileHash(worldX, worldZ, 11, 3)

const worldCoordFor = (species: number): { wx: number; wz: number } => {
  for (let cursor = 1; ; cursor += 1) {
    if (tileHash(cursor * 7, cursor * 3, SPECIES_SALT, 3) === species) return { wx: cursor * 7, wz: cursor * 3 };
  }
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ camera: "orthographic", orthoHalfHeight: args.zoom, cameraDistance: 12, cameraTilt: args.cameraTilt, background: "#1a2614" });
  stage.renderer.shadowMap.enabled = true;
  const sun = stage.scene.children.find((child) => child.type === "DirectionalLight");
  if (sun) sun.castShadow = true;
  const ground = createGrassGround(3);
  for (const tile of ground.group.children) tile.receiveShadow = true;
  stage.scene.add(ground.group);

  const forest = createForest(stage.scene, 8);
  const palms = createTropicalForest(stage.scene, 2);
  [0, 1, 2].forEach((species, i) => {
    const { wx, wz } = worldCoordFor(species);
    forest.addInstance(i * 1.1 - 1.65, 0, 0, wx, wz);
  });
  palms.addInstance(1.65, 0, 0, 5, 5);
  forest.addSparseLeafInstance(0, 1.1, 0, 3, 9);
  forest.commit();
  palms.commit();
  return wrapWithCleanup(stage, [forest.dispose, palms.dispose, ground.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/Tree Models",
  argTypes: {
    zoom: { control: { type: "range", min: 0.6, max: 3, step: 0.1 } },
    cameraTilt: { control: { type: "range", min: 0.3, max: 1.3, step: 0.05 } }
  },
  args: { zoom: 1.3, cameraTilt: 0.95 },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const Lineup: Story = {};
export const GameCamera: Story = { args: { zoom: 2.6, cameraTilt: 0.6 } };
export const CloseUp: Story = { args: { zoom: 0.75, cameraTilt: 0.9 } };
