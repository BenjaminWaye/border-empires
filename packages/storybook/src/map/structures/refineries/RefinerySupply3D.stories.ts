import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/client-styles.js";
import { hideRefineryChoiceSheet } from "@client/client-refineries/refinery-choice-sheet.js";
import { openRefineryWorldPicker, refineryWorld, renderRefineryWorld3D, type RefineryWorldVariant } from "../../../fixtures/refinery-world.js";

// Town refineries on the true-3D map (docs/territory-development-plan.md,
// Phase 2, Client): the district pipe continues from the refinery to its
// field with loads riding it, processed field tiles show the former Mine
// model instead of the bare deposit, and a broken link drops pipe, loads and
// models and raises the "needs a field" toast; the field picker tints the
// town's reach and fields on the ground.

type Args = { variant: RefineryWorldVariant; zoom: number };

const meta: Meta<Args> = {
  title: "Map/Structures/Refineries/Supply 3D",
  parameters: { layout: "fullscreen" },
  args: { variant: "working", zoom: 1 },
  argTypes: {
    variant: { control: "inline-radio", options: ["working", "broken", "unassigned", "picker"] },
    zoom: { control: { type: "range", min: 0.6, max: 3, step: 0.1 } }
  },
  render: ({ variant, zoom }) => {
    hideRefineryChoiceSheet();
    const world = refineryWorld(variant);
    const root = renderRefineryWorld3D(world, { zoom });
    if (variant === "picker") openRefineryWorldPicker(world);
    return root;
  }
};
export default meta;
type Story = StoryObj<Args>;
export const Working: Story = {};
export const CloseUp: Story = { args: { zoom: 2.2 } };
export const BrokenLinkToast: Story = { args: { variant: "broken" } };
export const FieldPicker: Story = { args: { variant: "picker" } };
