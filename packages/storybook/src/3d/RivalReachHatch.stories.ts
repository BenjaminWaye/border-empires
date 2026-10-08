import type { Meta, StoryObj } from "@storybook/html-vite";
import { Color } from "three";
import { createHeightfield } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createOwnershipOverlay } from "@client/client-map-3d-ownership-overlay.js";
import { createRivalReachHatch } from "@client/client-map-3d-rival-reach-hatch/client-map-3d-rival-reach-hatch.js";
import { tileCornerYs } from "@client/client-map-3d-tile-surface-y/client-map-3d-tile-surface-y.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// Design review for docs/map-readability-plan.md workstream 3: the real
// ownership overlay and the real rival-reach hatch, on the real heightfield.
// Two empires meet on a grass field. Left (blue) owns the settled core and a
// frontier ring; right (orange) owns a core too. The columns in between are
// unowned ground inside orange's reach, drawn as hatching in orange so they
// read as "his reach, not his land" instead of plain neutral ground.

type Args = { reachDepth: number; cameraDistance: number };

const BLUE = new Color("#4a8cff");
const ORANGE = new Color("#ff7a2e");
const CENTER = 100;
const RISE = 0.022;

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1a2030" });
  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);
  hf.rebuild({ camX: CENTER, camY: CENTER, halfW: 10, halfH: 8, worldWidth: 240, worldHeight: 240, tileKindAt: () => "GRASS" });

  const overlay = createOwnershipOverlay(stage.scene, 289);
  const hatch = createRivalReachHatch(stage.scene, 289);
  for (let dz = -4; dz <= 4; dz += 1) {
    for (let dx = -7; dx <= 7; dx += 1) {
      const x0 = dx, x1 = dx + 1, z0 = dz, z1 = dz + 1;
      const { corner00Y: a, corner10Y: b, corner01Y: c, corner11Y: d } = tileCornerYs(hf, dx + CENTER, dz + CENTER, dx + CENTER + 1, dz + CENTER + 1, RISE);
      if (dx <= -3) overlay.addTile(x0, a, z0, x1, b, z0, x0, c, z1, x1, d, z1, BLUE, dx === -3);
      else if (dx >= 3 + args.reachDepth) overlay.addTile(x0, a, z0, x1, b, z0, x0, c, z1, x1, d, z1, ORANGE, dx === 3 + args.reachDepth);
      else if (dx >= 0) hatch.addTile(x0, x1, z0, z1, a, b, c, d, ORANGE);
    }
  }
  overlay.commit();
  hatch.commit();

  return wrapWithCleanup(stage, [
    () => { stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines); },
    hf.dispose,
    overlay.dispose,
    hatch.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/RivalReachHatch",
  parameters: {
    docs: { description: { component: "Real ownership overlay + real rival-reach hatch (client-map-3d-rival-reach-hatch.ts) on real heightfield terrain: blue's land on the left, orange's on the right, hatched orange between them for unowned ground inside orange's reach. Workstream 3 of docs/map-readability-plan.md; 2D has no equivalent yet." } }
  },
  argTypes: {
    reachDepth: { control: { type: "range", min: 1, max: 5, step: 1 } },
    cameraDistance: { control: { type: "range", min: 6, max: 30, step: 1 } }
  },
  args: { reachDepth: 3, cameraDistance: 14 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const TwoEmpiresMeet: Story = {};
export const ThinReach: Story = { args: { reachDepth: 1 } };
