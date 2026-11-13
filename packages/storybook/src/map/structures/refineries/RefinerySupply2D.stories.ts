import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/client-styles.js";
import { hideRefineryChoiceSheet } from "@client/client-refineries/refinery-choice-sheet.js";
import { openRefineryWorldPicker, refineryWorld, renderRefineryWorld2D, type RefineryWorldVariant } from "../../../fixtures/refinery-world.js";

// Town refineries on the 2D map (docs/territory-development-plan.md, Phase 2,
// Client): the refinery's service line runs on from its town to its field
// with crates moving along it, the processed field tiles wear the former
// Mine art, a broken link drops line, crates and art and raises the "needs a
// field" toast, and the field picker highlights the town's reach and fields.

type Args = { variant: RefineryWorldVariant };

const render = ({ variant }: Args): HTMLElement => {
  hideRefineryChoiceSheet();
  const world = refineryWorld(variant);
  const root = renderRefineryWorld2D(world);
  if (variant === "picker") openRefineryWorldPicker(world);
  return root;
};

const meta: Meta<Args> = {
  title: "Map/Structures/Refineries/Supply 2D",
  parameters: { layout: "fullscreen" },
  args: { variant: "working" },
  argTypes: { variant: { control: "inline-radio", options: ["working", "broken", "unassigned", "picker"] } },
  render
};
export default meta;
type Story = StoryObj<Args>;
export const Working: Story = {};
export const BrokenLinkToast: Story = { args: { variant: "broken" } };
export const NoFieldToast: Story = { args: { variant: "unassigned" } };
export const FieldPicker: Story = { args: { variant: "picker" } };
