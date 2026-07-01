import type { Meta, StoryObj } from "@storybook/html-vite";
import { createFortOverlay } from "@client/client-map-3d-fort-overlay.js";
import type { FortificationOpening, FortificationOverlayKind } from "@client/client-fortification-overlays/client-fortification-overlays.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  kind: FortificationOverlayKind;
  opening: FortificationOpening;
  cameraDistance: number;
};

const KINDS: ReadonlyArray<FortificationOverlayKind> = ["FORT", "SIEGE_OUTPOST", "WOODEN_FORT", "LIGHT_OUTPOST"];
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
export const SiegeOutpost: Story = { args: { kind: "SIEGE_OUTPOST", opening: "CLOSED" } };
export const WoodenFort: Story = { args: { kind: "WOODEN_FORT", opening: "EAST" } };
export const LightOutpost: Story = { args: { kind: "LIGHT_OUTPOST", opening: "CLOSED" } };
