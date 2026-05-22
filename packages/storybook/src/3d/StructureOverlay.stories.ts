import type { Meta, StoryObj } from "@storybook/html";
import { createStructureOverlay, type StructureKind, type StructureResourceHint } from "@client/client-map-3d-structure-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  structures: StructureKind[];
  resourceHint: "none" | "IRON" | "GEMS";
  cameraDistance: number;
  spacing: number;
};

const KINDS: ReadonlyArray<StructureKind> = [
  "FARMSTEAD", "WATERWORKS", "CAMP", "MINE", "IRONWORKS",
  "MARKET", "OBSERVATORY", "GRANARY", "SEED_GRANARY"
];

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1b1d22" });
  const overlay = createStructureOverlay(stage.scene, Math.max(args.structures.length, 1));
  const hint: StructureResourceHint = args.resourceHint === "none" ? undefined : args.resourceHint;
  args.structures.forEach((kind, idx) => {
    const x = (idx - (args.structures.length - 1) / 2) * args.spacing;
    overlay.addInstance(x, 0, 0, kind, hint);
  });
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/StructureOverlay",
  argTypes: {
    structures: { control: "check", options: KINDS as unknown as string[] },
    resourceHint: { control: "inline-radio", options: ["none", "IRON", "GEMS"] },
    cameraDistance: { control: { type: "range", min: 2, max: 18, step: 0.5 } },
    spacing: { control: { type: "range", min: 0.8, max: 2.5, step: 0.1 } }
  },
  args: { structures: [...KINDS], resourceHint: "none", cameraDistance: 10, spacing: 1.3 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const AllKinds: Story = {};
export const Farmstead: Story = { args: { structures: ["FARMSTEAD"], cameraDistance: 3 } };
export const Mine: Story = { args: { structures: ["MINE"], cameraDistance: 3 } };
export const MineIron: Story = { args: { structures: ["MINE"], resourceHint: "IRON", cameraDistance: 3 } };
export const MineGems: Story = { args: { structures: ["MINE"], resourceHint: "GEMS", cameraDistance: 3 } };
export const Observatory: Story = { args: { structures: ["OBSERVATORY"], cameraDistance: 3 } };
export const Market: Story = { args: { structures: ["MARKET"], cameraDistance: 3 } };
export const Granary: Story = { args: { structures: ["GRANARY"], cameraDistance: 3 } };
