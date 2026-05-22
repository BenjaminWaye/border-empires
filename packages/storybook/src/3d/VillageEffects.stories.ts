import type { Meta, StoryObj } from "@storybook/html-vite";
import { createVillageEffects } from "@client/client-map-3d-village-fx.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  showOwned: boolean;
  showCaptured: boolean;
  showCapital: boolean;
  capitalColor: string;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#10131a" });
  const fx = createVillageEffects(stage.scene);
  fx.clear();

  let seed = 1;
  if (args.showOwned) {
    forEachGridCell({ radius: 1, spacing: 2 }, (x, z) => {
      fx.addOwnedVillage(x - 4, z, 0, seed++);
    });
  }
  if (args.showCaptured) {
    forEachGridCell({ radius: 1, spacing: 2 }, (x, z) => {
      fx.addCapturedTownSmoke(x + 4, z, 0, seed++);
    });
  }
  if (args.showCapital) {
    fx.addCapitalBanner(0, -4, 0, args.capitalColor, seed++);
  }
  fx.commit();

  const start = performance.now();
  let rafId = 0;
  const animate = (): void => {
    fx.update(performance.now() - start);
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    fx.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/VillageEffects",
  parameters: {
    docs: { description: { component: "Animated layer: owned-village smoke (left), captured-town smoke (right), capital banner (bottom)." } }
  },
  argTypes: {
    showOwned: { control: "boolean" },
    showCaptured: { control: "boolean" },
    showCapital: { control: "boolean" },
    capitalColor: { control: "color" },
    cameraDistance: { control: { type: "range", min: 6, max: 24, step: 1 } }
  },
  args: { showOwned: true, showCaptured: true, showCapital: true, capitalColor: "#e0b06b", cameraDistance: 14 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const AllEffects: Story = {};
export const OwnedOnly: Story = { args: { showOwned: true, showCaptured: false, showCapital: false } };
export const CapturedOnly: Story = { args: { showOwned: false, showCaptured: true, showCapital: false } };
export const CapitalOnly: Story = { args: { showOwned: false, showCaptured: false, showCapital: true, cameraDistance: 6 } };
export const CapitalBlue: Story = { args: { showOwned: false, showCaptured: false, showCapital: true, capitalColor: "#4a8cff", cameraDistance: 6 } };
