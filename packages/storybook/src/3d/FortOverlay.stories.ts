import type { Meta, StoryObj } from "@storybook/html-vite";
import { createFortOverlay } from "@client/client-map-3d-fort-overlay.js";
import type { FortificationOpening, FortificationOverlayKind } from "@client/client-fortification-overlays/client-fortification-overlays.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  kind: FortificationOverlayKind;
  opening: FortificationOpening;
  cameraDistance: number;
};

const KINDS: ReadonlyArray<FortificationOverlayKind> = [
  "FORT",
  "TITANIUM_BASTION",
  "THUNDER_BASTION",
  "WOODEN_FORT",
  "SIEGE_OUTPOST"
];
const OPENINGS: ReadonlyArray<FortificationOpening> = ["CLOSED", "NORTH", "EAST", "SOUTH", "WEST"];

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1d1810" });
  const overlay = createFortOverlay(stage.scene, 1);
  overlay.addInstance(0, 0, 0, args.kind, args.opening);
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/FortOverlay",
  argTypes: {
    kind: { control: "inline-radio", options: KINDS as unknown as string[] },
    opening: { control: "inline-radio", options: OPENINGS as unknown as string[] },
    cameraDistance: { control: { type: "range", min: 2, max: 14, step: 0.5 } }
  },
  args: { kind: "FORT", opening: "CLOSED", cameraDistance: 4 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const FortClosed: Story = {};
export const FortGateNorth: Story = { args: { kind: "FORT", opening: "NORTH" } };
export const TitaniumBastionClosed: Story = { args: { kind: "TITANIUM_BASTION", opening: "CLOSED" } };
export const TitaniumBastionGateNorth: Story = { args: { kind: "TITANIUM_BASTION", opening: "NORTH" } };
export const TitaniumBastionGateEast: Story = { args: { kind: "TITANIUM_BASTION", opening: "EAST" } };
export const TitaniumBastionGateSouth: Story = { args: { kind: "TITANIUM_BASTION", opening: "SOUTH" } };
export const TitaniumBastionGateWest: Story = { args: { kind: "TITANIUM_BASTION", opening: "WEST" } };
export const ThunderBastionClosed: Story = { args: { kind: "THUNDER_BASTION", opening: "CLOSED" } };
export const ThunderBastionGateNorth: Story = { args: { kind: "THUNDER_BASTION", opening: "NORTH" } };
export const ThunderBastionGateEast: Story = { args: { kind: "THUNDER_BASTION", opening: "EAST" } };
export const ThunderBastionGateSouth: Story = { args: { kind: "THUNDER_BASTION", opening: "SOUTH" } };
export const ThunderBastionGateWest: Story = { args: { kind: "THUNDER_BASTION", opening: "WEST" } };
export const WoodenFort: Story = { args: { kind: "WOODEN_FORT", opening: "EAST" } };
export const SiegeOutpost: Story = { args: { kind: "SIEGE_OUTPOST", opening: "CLOSED" } };

export const AllVariants: Story = {
  args: { cameraDistance: 8 },
  render: (args) => {
    const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1d1810" });
    const overlay = createFortOverlay(stage.scene, KINDS.length);
    const startX = -((KINDS.length - 1) * 1.35) / 2;
    KINDS.forEach((kind, index) => {
      overlay.addInstance(startX + index * 1.35, 0, 0, kind, kind === "SIEGE_OUTPOST" ? "CLOSED" : "NORTH");
    });
    overlay.commit();
    return wrapWithCleanup(stage, [overlay.dispose]);
  }
};
