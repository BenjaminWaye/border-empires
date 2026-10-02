import type { Meta, StoryObj } from "@storybook/html-vite";
import { createForest, tileHash } from "@client/client-map-3d-forest.js";
import { createMountainMassifs } from "@client/client-map-3d-mountain-massif.js";
import { createTropicalForest } from "@client/client-map-3d-tropical-forest.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";

// Scale check: every tree type the 3D map draws, standing in front of a
// mountain range, so tree height reads directly against mountain height.
// Columns left -> right: pine, spruce, leaf, tropical palm, light-grass
// sapling. Mountains fill the back row.

type Args = {
  cameraDistance: number;
  cameraTilt: number;
};

type Column = { readonly label: string; readonly xs: ReadonlyArray<number> };

const PINE = 0;
const SPRUCE = 1;
const LEAF = 2;
const SPECIES_SALT = 11; // createForest picks species with tileHash(worldX, worldZ, 11, 3)

const COLUMNS: ReadonlyArray<Column> = [
  { label: "Pine", xs: [-5, -4] },
  { label: "Spruce", xs: [-2, -1] },
  { label: "Leaf", xs: [1, 2] },
  { label: "Tropical palm", xs: [4] },
  { label: "Sapling", xs: [5] }
];
const TREE_ROWS = [0, 1];
const MOUNTAIN_ROW_Z = -1;
const MOUNTAIN_XS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

// createForest picks a tile's species by hashing its WORLD coordinates, so
// to force a species we hand it world coords that hash to that species
// (scene placement stays wherever we put the tile). Each call walks forward
// so neighbouring tiles also get different spacing layouts.
const makeWorldCoordPicker = (): ((species: number) => { wx: number; wz: number }) => {
  let cursor = 0;
  return (species) => {
    for (;;) {
      cursor += 1;
      const wx = cursor * 7;
      const wz = cursor * 3;
      if (tileHash(wx, wz, SPECIES_SALT, 3) === species) return { wx, wz };
    }
  };
};

const createLegend = (): HTMLElement => {
  const legend = document.createElement("div");
  legend.style.cssText = "padding:8px 12px;font:13px system-ui,sans-serif;color:#d9e2cf;background:#0a0e14;text-align:center";
  legend.textContent = `Front, left to right: ${COLUMNS.map((c) => c.label).join(" · ")}. Back row: mountains.`;
  return legend;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: args.cameraTilt, background: "#1a2614" });
  const ground = createGrassGround(6);
  stage.scene.add(ground.group);

  const massifs = createMountainMassifs(stage.scene, MOUNTAIN_XS.length);
  for (const x of MOUNTAIN_XS) massifs.addInstance(x, MOUNTAIN_ROW_Z, 0);
  massifs.commit();

  const forest = createForest(stage.scene, 64);
  const tropical = createTropicalForest(stage.scene, 16);
  const pick = makeWorldCoordPicker();
  const [pineCol, spruceCol, leafCol, palmCol, saplingCol] = COLUMNS;
  const speciesCols: ReadonlyArray<readonly [Column, number]> = [
    [pineCol!, PINE],
    [spruceCol!, SPRUCE],
    [leafCol!, LEAF]
  ];
  for (const z of TREE_ROWS) {
    for (const [column, species] of speciesCols) {
      for (const x of column.xs) {
        const { wx, wz } = pick(species);
        forest.addInstance(x, z, 0, wx, wz);
      }
    }
    for (const x of palmCol!.xs) tropical.addInstance(x, z, 0, x * 5 + z, z * 3);
    for (const x of saplingCol!.xs) forest.addSparseLeafInstance(x, z, 0, x, z);
  }
  forest.commit();
  tropical.commit();

  const container = wrapWithCleanup(stage, [massifs.dispose, forest.dispose, tropical.dispose, ground.dispose]);
  container.appendChild(createLegend());
  return container;
};

const meta: Meta<Args> = {
  title: "3D Library/ForestVsMountains",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 6, max: 30, step: 1 } },
    cameraTilt: { control: { type: "range", min: 0.2, max: 1.45, step: 0.05 } }
  },
  args: { cameraDistance: 9, cameraTilt: 1.0 },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
// Near-horizontal camera: tree and mountain silhouettes side by side.
export const SideView: Story = { args: { cameraDistance: 9, cameraTilt: 1.38 } };
// Close to the in-game top-down camera.
export const GameplayAngle: Story = { args: { cameraDistance: 11, cameraTilt: 0.6 } };
