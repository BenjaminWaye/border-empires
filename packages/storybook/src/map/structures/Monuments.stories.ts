import type { Meta, StoryObj } from "@storybook/html-vite";
import { DISTRICT_PROJECT_KINDS } from "@client/client-town-district/district-catalog.js";
import { renderStructureIdentityReview } from "./town-district-identity-review.js";

const meta: Meta = { title: "Map/Structures/Monuments", parameters: { layout: "fullscreen" },
  render: () => renderStructureIdentityReview(DISTRICT_PROJECT_KINDS, "Completed Great Project") };
export default meta;
export const IdentityReview: StoryObj = {};
