import type { Meta, StoryObj } from "@storybook/html-vite";
import { createSiegeOutpostOverlay } from "@client/client-map-3d-siege-outpost-overlay.js";
import { createGrassGround, createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  gridRadius: number;
  spacing: number;
  cameraDistance: number;
  orthographic: boolean;
  row: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({
    cameraDistance: args.cameraDistance,
    camera: args.orthographic ? "orthographic" : "perspective",
    orthoHalfHeight: 2.4,
    background: "#0d1018"
  });
  const ground = createGrassGround(Math.max(args.gridRadius, args.row ? 3 : 0) + 1, 0);
  stage.scene.add(ground.group);

  const maxTiles = (args.gridRadius * 2 + 1) ** 2;
  const overlay = createSiegeOutpostOverlay(stage.scene, maxTiles);
  if (args.row) {
    // A single east-west row so you can study the animated side-by-side.
    for (let i = -2; i <= 2; i += 1) {
      overlay.addInstance(i, 0, 0, i, 0);
    }
  } else {
    forEachGridCell({ radius: args.gridRadius, spacing: args.spacing }, (x, z) => {
      overlay.addInstance(x, z, 0, x, z);
    });
  }
  overlay.commit();

  let rafId = 0;
  const animate = (): void => {
    overlay.update(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    () => {
      ground.dispose();
      overlay.dispose();
    }
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/SiegeOutpostOverlay",
  parameters: {
    docs: {
      description: {
        component:
          "Siege Outpost: one compact armored siege machine of blackened iron and aged brass -- a low riveted hull with a sloped front glacis, planted on six short stabilizing legs. On top a large forward-facing siege cannon with a turret pintle, recoil housing, brass barrel band and muzzle brake; on the rear deck a small aether targeting device whose head sweeps with a subtle violet glow, plus a cyan capacitor on the cannon housing. Dark iron, aged brass, cyan/violet aether glow; the machine is the whole silhouette."
      }
    }
  },
  argTypes: {
    gridRadius: { control: { type: "range", min: 0, max: 5, step: 1 } },
    spacing: { control: { type: "range", min: 1, max: 3, step: 0.25 } },
    cameraDistance: { control: { type: "range", min: 2, max: 30, step: 1 } },
    orthographic: { control: "boolean" },
    row: { control: "boolean" }
  },
  args: { gridRadius: 2, spacing: 1.5, cameraDistance: 10, orthographic: true, row: false },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Single: Story = { args: { gridRadius: 0, cameraDistance: 4, orthographic: true } };
export const Row: Story = { args: { gridRadius: 0, cameraDistance: 10, orthographic: true, row: true } };
export const Field: Story = { args: { gridRadius: 3, spacing: 1.5, cameraDistance: 20, orthographic: false } };