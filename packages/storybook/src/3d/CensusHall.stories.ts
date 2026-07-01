import type { Meta, StoryObj } from "@storybook/html-vite";
import { createStructurePieceBuilder } from "@client/client-map-3d-structure-builder.js";
import { registerCivicStructures } from "@client/client-map-3d-structure-civic.js";
import { createCensusHallFx } from "@client/client-map-3d-census-hall-fx.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// Standalone story for the steampunk Census Hall: builds the static
// piece-builder mesh directly (bypassing the family-aggregator in
// client-map-3d-structure-overlay.js, whose deep transitive import
// graph currently trips Vite's dependency scanner in this workspace)
// and layers the animated fx companion (rotating brass gears, chimney
// steam, pulsing dome beacon) on top, same as the in-game render loop.

type Args = {
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1b1d22" });
  const { builder, commit, dispose: disposeBuilder } = createStructurePieceBuilder(stage.scene, 1);
  const civic = registerCivicStructures(builder);
  civic.layouts.CENSUS_HALL(0, 0, 0);
  commit();

  const fx = createCensusHallFx(stage.scene);
  fx.addInstance(0, 0, 0, 7);
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
    disposeBuilder,
    fx.dispose
  ]);
};

const meta: Meta<Args> = {
  title: "3D Library/CensusHall",
  parameters: {
    docs: { description: { component: "Steampunk tabulating office: brass tally drum, oxidized-copper dome, meshing gears, chimney steam, pulsing dome beacon." } }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 1.5, max: 8, step: 0.25 } }
  },
  args: { cameraDistance: 3 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const CloseUp: Story = { args: { cameraDistance: 2 } };
