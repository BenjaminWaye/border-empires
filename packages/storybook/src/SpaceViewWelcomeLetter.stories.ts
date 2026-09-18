import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  spaceViewWelcomeNamingStepHtml,
  spaceViewWelcomeLetterStepHtml,
  spaceViewWelcomeStyle
} from "@client/client-space-view/client-space-view-welcome-letter.js";

// The naming/letter backdrop is `position: absolute` against its Space View
// screen in-game (see the module's .sv-welcome-backdrop rule) -- here it's
// pinned to a fixed-size relative wrapper instead so it renders in place in
// the docs canvas rather than covering the whole story iframe.
const WRAPPER_STYLE = `
.sb-welcome-frame {
  position: relative;
  width: min(560px, 100%);
  height: 620px;
  border-radius: 12px;
  overflow: hidden;
  background: radial-gradient(ellipse at center, #0f172a 0%, #020617 70%);
}
`;

const renderStep = (html: string): HTMLElement => {
  const style = document.createElement("style");
  style.textContent = spaceViewWelcomeStyle + WRAPPER_STYLE;
  document.head.appendChild(style);

  const frame = document.createElement("div");
  frame.className = "sb-welcome-frame";
  frame.innerHTML = html;
  return frame;
};

const meta: Meta = {
  title: "UI/Space View Welcome Letter",
  parameters: {
    backgrounds: { default: "game" },
    docs: {
      description: {
        component:
          "The first-visit-to-Space flow: name your new Planet, then receive a decree letter from the Imperial Court welcoming you as its Duke. Rendered with the real HTML/CSS from client-space-view-welcome-letter.ts (source of truth for copy changes). See client-space-view.ts for how this is gated to first visit via discovery-tip storage."
      }
    }
  }
};

export default meta;
type Story = StoryObj;

export const NamingStep: Story = {
  render: () => renderStep(spaceViewWelcomeNamingStepHtml())
};

export const DecreeLetter: Story = {
  render: () => renderStep(spaceViewWelcomeLetterStepHtml("Argenta"))
};
