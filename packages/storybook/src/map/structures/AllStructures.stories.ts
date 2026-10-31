import type { Meta, StoryObj } from "@storybook/html-vite";
import { STRUCTURE_REGISTRY, type StructureDisplayKey } from "@border-empires/shared";
import { renderStructureIdentityReview } from "./town-district-identity-review.js";

// The current build registry, rather than the larger save-compatibility union,
// controls this catalogue. Each selection uses the live map's renderer route.
export const CURRENT_STRUCTURE_KINDS = Object.keys(STRUCTURE_REGISTRY) as StructureDisplayKey[];
const meta: Meta = {
  title: "Map/Structures/All Structures",
  render: () => renderStructureIdentityReview(CURRENT_STRUCTURE_KINDS)
};
export default meta;
export const AllKinds: StoryObj = {};
