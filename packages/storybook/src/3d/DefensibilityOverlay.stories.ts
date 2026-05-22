import type { Meta, StoryObj } from "@storybook/html";
import { createDefensibilityOverlay } from "@client/client-map-3d-defensibility-overlay.js";
import type { WeakDefensibilitySeverity } from "@client/client-defensibility-tile.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  severity: WeakDefensibilitySeverity;
  count: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#221610" });
  const overlay = createDefensibilityOverlay(stage.scene, args.count);
  for (let i = 0; i < args.count; i += 1) {
    const x = (i - (args.count - 1) / 2) * 1.4;
    overlay.addInstance(x, 0, 0, args.severity);
  }
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/DefensibilityOverlay",
  argTypes: {
    severity: { control: "inline-radio", options: ["warning", "critical"] },
    count: { control: { type: "range", min: 1, max: 6, step: 1 } },
    cameraDistance: { control: { type: "range", min: 2, max: 16, step: 0.5 } }
  },
  args: { severity: "warning", count: 1, cameraDistance: 4 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Warning: Story = {};
export const Critical: Story = { args: { severity: "critical" } };
export const RowMixed: Story = { args: { count: 4, cameraDistance: 8 } };
