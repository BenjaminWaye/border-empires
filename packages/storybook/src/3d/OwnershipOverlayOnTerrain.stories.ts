import type { Meta, StoryObj } from "@storybook/html-vite";
import { Color } from "three";
import { createHeightfield, type HeightfieldTerrainKind } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createOwnershipOverlay } from "@client/client-map-3d-ownership-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// OwnershipOverlay's other stories (OwnershipOverlay.stories.ts) render tiles
// on a flat dark background with no ground mesh underneath -- fine for
// checking the tint colors in isolation, but it can't show what the tint
// actually looks like sitting on real biome terrain, which is the whole
// point of the opacity tuning (PR: lower SETTLED/FRONTIER_OPACITY so terrain
// stays visible underneath). This story pairs the real heightfield terrain
// mesh with the real ownership overlay so that's actually visible.

type Args = {
  terrain: "grass" | "sand" | "grass-sand-split";
  ownership: "settled" | "frontier" | "both";
  cameraDistance: number;
};

const PLAYER_A = new Color("#4a8cff");
const PLAYER_B = new Color("#ff6a4a");

const tileKindForTerrain = (terrain: Args["terrain"]) => (wx: number, _wy: number): HeightfieldTerrainKind => {
  if (terrain === "grass") return "GRASS";
  if (terrain === "sand") return "SAND";
  return wx < 0 ? "GRASS" : "SAND";
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1a2030" });
  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);

  const tileKindAt = tileKindForTerrain(args.terrain);
  hf.rebuild({ camX: 0, camY: 0, halfW: 6, halfH: 6, worldWidth: 240, worldHeight: 240, tileKindAt });

  const overlay = createOwnershipOverlay(stage.scene, 121);
  for (let dz = -5; dz <= 5; dz += 1) {
    for (let dx = -5; dx <= 5; dx += 1) {
      const r = Math.max(Math.abs(dx), Math.abs(dz));
      const isFrontier = args.ownership === "frontier" || (args.ownership === "both" && r >= 3);
      if (args.ownership === "settled" && r >= 4) continue;
      const x0 = dx - 0.5, x1 = dx + 0.5, z0 = dz - 0.5, z1 = dz + 0.5;
      const y = 0.19; // just above grass/sand elevation, matches hf.rebuild's tile height
      overlay.addTile(x0, y, z0, x1, y, z0, x0, y, z1, x1, y, z1, dx < 0 ? PLAYER_A : PLAYER_B, isFrontier);
    }
  }
  overlay.commit();

  return wrapWithCleanup(stage, [
    () => { stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines); },
    hf.dispose,
    overlay.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/OwnershipOverlayOnTerrain",
  parameters: {
    docs: { description: { component: "Real ownership overlay (client-map-3d-ownership-overlay.ts) composited on real heightfield terrain (client-map-3d-heightfield.ts) -- shows the actual current SETTLED/FRONTIER_OPACITY values against grass and sand, which the flat-background OwnershipOverlay stories can't." } }
  },
  argTypes: {
    terrain: { control: "inline-radio", options: ["grass", "sand", "grass-sand-split"] },
    ownership: { control: "inline-radio", options: ["settled", "frontier", "both"] },
    cameraDistance: { control: { type: "range", min: 6, max: 30, step: 1 } }
  },
  args: { terrain: "grass-sand-split", ownership: "both", cameraDistance: 14 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const GrassAndSandSplit: Story = {};
export const AllGrass: Story = { args: { terrain: "grass" } };
export const AllSand: Story = { args: { terrain: "sand" } };
export const SettledOnly: Story = { args: { ownership: "settled" } };
export const FrontierOnly: Story = { args: { ownership: "frontier" } };
