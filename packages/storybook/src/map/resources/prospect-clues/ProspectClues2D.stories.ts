import type { Meta, StoryObj } from "@storybook/html-vite";
import type { ProspectSignature } from "@border-empires/shared";
import { drawForestOverlay } from "@client/client-map-render/client-map-render-forest-overlay.js";
import { drawProspectSignatureOverlay } from "@client/client-prospect-signature-overlay.js";

// The worldgen prospect clues in the 2D canvas renderer: each block is half
// forest (left) and half open ground (right). Twin of 3D Library/ProspectClues.

type Clue = ProspectSignature | "NONE";

type Args = {
  clue: "ALL" | Clue;
  tileSize: number;
};

const GRASS = "#6d8a3f";
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
  const size = args.tileSize;
  const canvas = document.createElement("canvas");
  canvas.width = (clues.length * (BLOCK_W + 1) - 1) * size;
  canvas.height = BLOCK_H * size + 24;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  // Redraw every frame so the crystal shards' glint animates as in-game.
  const draw = (): void => {
    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    clues.forEach((clue, blockIdx) => {
      const blockPx = blockIdx * (BLOCK_W + 1) * size;
      for (let dx = 0; dx < BLOCK_W; dx += 1) {
        for (let dy = 0; dy < BLOCK_H; dy += 1) {
          const px = blockPx + dx * size;
          const py = dy * size;
          ctx.fillStyle = GRASS;
          ctx.fillRect(px, py, size, size);
          const forested = dx < BLOCK_W / 2;
          const prospectClue = clue === "NONE" ? undefined : { signature: clue, propsAllowed: true };
          const wx = 400 + blockIdx * 10 + dx;
          const wy = 200 + dy;
          // Same order as the game: trees, then (after hills) the ground props.
          drawForestOverlay(ctx, wx, wy, px, py, size, prospectClue, () => forested);
          drawProspectSignatureOverlay(ctx, prospectClue, wx, wy, px, py, size);
        }
      }
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText(LABELS[clue], blockPx + 4, BLOCK_H * size + 17);
    });
    if (canvas.isConnected || !started) requestAnimationFrame(draw);
    started = true;
  };
  let started = false;
  draw();
  return canvas;
};

const meta: Meta<Args> = {
  title: "Map/Resources/Prospect Clues/2D",
  argTypes: {
    clue: { control: "select", options: ["ALL", ...ALL_CLUES] },
    tileSize: { control: { type: "range", min: 16, max: 96, step: 4 } }
  },
  args: { clue: "ALL", tileSize: 48 },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const AllClues: Story = {};
export const BlackwoodCanopy: Story = { args: { clue: "BLACKWOOD_CANOPY", tileSize: 80 } };
export const FerrousDust: Story = { args: { clue: "FERROUS_DUST", tileSize: 80 } };
export const RefractiveGround: Story = { args: { clue: "REFRACTIVE_GROUND", tileSize: 80 } };
