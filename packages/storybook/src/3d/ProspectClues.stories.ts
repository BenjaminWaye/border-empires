import type { Meta, StoryObj } from "@storybook/html-vite";
import type { ProspectSignature } from "@border-empires/shared";
import { createForest } from "@client/client-map-3d-forest.js";
import { createProspectClueLayer, prospectClueTreeTint } from "@client/client-map-3d-prospect-clue/client-map-3d-prospect-clue-layer.js";
import type { Tile } from "@client/client-types.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";

// The worldgen prospect clues in the true-3D renderer: each block is half
// forest (left) and half open ground (right). Blackwood darkens the forest's
// own trees and plants blackwood trees on open ground; ferrous dust and
// refractive ground scatter flecks/shards. "None" is the plain reference.
// 2D twin: 2D/ProspectClues.

type Clue = ProspectSignature | "NONE";

type Args = {
  clue: "ALL" | Clue;
  cameraDistance: number;
};

const BLOCK_W = 6;
const BLOCK_H = 4;
const ALL_CLUES: ReadonlyArray<Clue> = ["NONE", "BLACKWOOD_CANOPY", "FERROUS_DUST", "REFRACTIVE_GROUND"];
const LABELS: Record<Clue, string> = {
  NONE: "No clue",
  BLACKWOOD_CANOPY: "Blackwood canopy",
  FERROUS_DUST: "Ferrous dust",
  REFRACTIVE_GROUND: "Refractive ground"
};

const render = (args: Args): HTMLElement => {
  const clues = args.clue === "ALL" ? ALL_CLUES : [args.clue];
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.75, background: "#1a2614" });
  const totalW = clues.length * BLOCK_W + (clues.length - 1);
  const ground = createGrassGround(Math.ceil(totalW / 2) + 1);
  stage.scene.add(ground.group);
  const maxTiles = clues.length * BLOCK_W * BLOCK_H;
  const forest = createForest(stage.scene, maxTiles);
  const prospectClues = createProspectClueLayer(stage.scene, maxTiles);
  clues.forEach((clue, blockIdx) => {
    const blockX = blockIdx * (BLOCK_W + 1) - Math.floor(totalW / 2);
    for (let dx = 0; dx < BLOCK_W; dx += 1) {
      for (let dz = 0; dz < BLOCK_H; dz += 1) {
        const x = blockX + dx;
        const z = dz - Math.floor(BLOCK_H / 2);
        // Offset world coords so the per-tile hashes look like a real map, not the origin.
        const wx = 400 + x;
        const wy = 200 + z;
        const tile: Tile = clue === "NONE" ? { x: wx, y: wy, terrain: "LAND" } : { x: wx, y: wy, terrain: "LAND", prospectSignature: clue };
        const treesOnTile = dx < BLOCK_W / 2;
        if (treesOnTile) forest.addInstance(x, z, 0, wx, wy, prospectClueTreeTint(tile, "LAND", "visible"));
        prospectClues.addTile({ tile, terrain: "LAND", visibility: "visible", x, z, wx, wy, surfaceY: 0, treesOnTile });
      }
    }
  });
  forest.commit();
  prospectClues.commit();

  const container = wrapWithCleanup(stage, [forest.dispose, prospectClues.dispose, ground.dispose]);
  const legend = document.createElement("div");
  legend.style.cssText = "display:flex;justify-content:space-around;padding:8px;color:#cbd5e1;font:13px system-ui,sans-serif";
  for (const clue of clues) {
    const label = document.createElement("span");
    label.textContent = LABELS[clue];
    legend.appendChild(label);
  }
  container.appendChild(legend);
  return container;
};

const meta: Meta<Args> = {
  title: "3D Library/ProspectClues",
  argTypes: {
    clue: { control: "select", options: ["ALL", ...ALL_CLUES] },
    cameraDistance: { control: { type: "range", min: 4, max: 40, step: 1 } }
  },
  args: { clue: "ALL", cameraDistance: 17 },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const AllClues: Story = {};
export const BlackwoodCanopy: Story = { args: { clue: "BLACKWOOD_CANOPY", cameraDistance: 8 } };
export const FerrousDust: Story = { args: { clue: "FERROUS_DUST", cameraDistance: 8 } };
export const RefractiveGround: Story = { args: { clue: "REFRACTIVE_GROUND", cameraDistance: 8 } };
