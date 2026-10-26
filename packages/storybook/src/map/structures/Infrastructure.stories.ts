import type { Meta, StoryObj } from "@storybook/html-vite";
import { renderStructureIdentityReview } from "./town-district-identity-review.js";
const meta: Meta = { title: "Map/Structures/Infrastructure", render: () => renderStructureIdentityReview(
  ["MINE", "HARBOR_EXCHANGE", "RELAY_BEACON", "OBSERVATORY", "UMBRITE_RIG"], "Infrastructure structure") };
export default meta;
export const IdentityReview: StoryObj = {};
