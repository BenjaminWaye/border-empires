import type { Meta, StoryObj } from "@storybook/html-vite";
import { INFRASTRUCTURE_REVIEW_KINDS } from "@client/client-infrastructure/infrastructure-art.js";
import { renderStructureIdentityReview } from "./town-district-identity-review.js";

const meta: Meta = { title: "Map/Structures/Infrastructure", parameters: { layout: "fullscreen" },
  render: () => renderStructureIdentityReview(INFRASTRUCTURE_REVIEW_KINDS, "Infrastructure structure") };
export default meta;
export const IdentityReview: StoryObj = {};
