import type { Meta, StoryObj } from "@storybook/html-vite";
import { createAtmosphere } from "@client/client-map-3d-atmosphere.js";
import { createForest } from "@client/client-map-3d-forest.js";
import { createMountainMassifs } from "@client/client-map-3d-mountain-massif.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  showForeground: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: 18 });
  const atmosphere = createAtmosphere(stage.scene);
  const cleanups: Array<() => void> = [atmosphere.dispose];

  if (args.showForeground) {
    const forest = createForest(stage.scene, 81);
    forEachGridCell({ radius: 4, spacing: 1 }, (x, z) => forest.addInstance(x, z, 0));
    forest.commit();
    cleanups.push(forest.dispose);

    const massifs = createMountainMassifs(stage.scene, 9);
    forEachGridCell({ radius: 1, spacing: 4 }, (x, z) => massifs.addInstance(x, 6 + z, 0));
    massifs.commit();
    cleanups.push(massifs.dispose);
  }

  return wrapWithCleanup(stage, cleanups);
};

const meta: Meta<Args> = {
  title: "3D Library/Atmosphere",
  parameters: {
    docs: {
      description: {
        component: "Sky shader, fog, and three-light rig. The shipped config is intentionally dark — sky colors are #000000 and fog is dense."
      }
    }
  },
  argTypes: {
    showForeground: { control: "boolean", description: "Add forest + mountains to show how fog reads" }
  },
  args: { showForeground: true },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const SkyOnly: Story = { args: { showForeground: false } };
