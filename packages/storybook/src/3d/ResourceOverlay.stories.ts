import type { Meta, StoryObj } from "@storybook/html-vite";
import { createResourceOverlay, type ResourceKind } from "@client/client-map-3d-resource-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  resources: ResourceKind[];
  cameraDistance: number;
  spacing: number;
};

const KINDS: ReadonlyArray<ResourceKind> = ["FARM", "WOOD", "IRON", "GEMS", "FISH", "FUR", "OIL"];

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1a2014" });
  const overlay = createResourceOverlay(stage.scene, Math.max(args.resources.length, 1));
  args.resources.forEach((res, idx) => {
    const x = (idx - (args.resources.length - 1) / 2) * args.spacing;
    overlay.addInstance(x, 0, 0, res, Math.round(x), 0);
  });
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/ResourceOverlay",
  argTypes: {
    resources: { control: "check", options: KINDS as unknown as string[] },
    cameraDistance: { control: { type: "range", min: 2, max: 16, step: 0.5 } },
    spacing: { control: { type: "range", min: 0.8, max: 2.5, step: 0.1 } }
  },
  args: { resources: [...KINDS], cameraDistance: 8, spacing: 1.2 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const AllKinds: Story = {};
export const Farm: Story = { args: { resources: ["FARM"], cameraDistance: 3 } };
export const Wood: Story = { args: { resources: ["WOOD"], cameraDistance: 3 } };
export const Iron: Story = { args: { resources: ["IRON"], cameraDistance: 3 } };
export const Gems: Story = { args: { resources: ["GEMS"], cameraDistance: 3 } };
export const Fish: Story = { args: { resources: ["FISH"], cameraDistance: 3 } };
export const Fur: Story = { args: { resources: ["FUR"], cameraDistance: 3 } };
export const Oil: Story = { args: { resources: ["OIL"], cameraDistance: 3 } };
