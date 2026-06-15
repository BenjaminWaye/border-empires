import type { Meta, StoryObj } from "@storybook/html-vite";
import { createBreachBorderOverlay } from "@client/client-map-3d-breach-border-overlay.js";
import type { BreachBorderOverlay } from "@client/client-map-3d-breach-border-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  northEdge: boolean;
  eastEdge: boolean;
  southEdge: boolean;
  westEdge: boolean;
  tileCount: number;
  cameraDistance: number;
};

const ALL_DIRS = ["north", "east", "south", "west"] as const;

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1a1f2e" });
  const overlay = createBreachBorderOverlay(stage.scene, args.tileCount * 4);

  for (let i = 0; i < args.tileCount; i += 1) {
    const x = (i - (args.tileCount - 1) / 2) * 1.1;
    if (args.northEdge) overlay.addEdge(x, 0, 0, "north");
    if (args.eastEdge)  overlay.addEdge(x, 0, 0, "east");
    if (args.southEdge) overlay.addEdge(x, 0, 0, "south");
    if (args.westEdge)  overlay.addEdge(x, 0, 0, "west");
  }
  overlay.commit();

  let rafId = 0;
  const tick = (): void => {
    overlay.tick(performance.now());
    rafId = requestAnimationFrame(tick);
  };
  tick();

  return wrapWithCleanup(stage, [overlay.dispose, () => cancelAnimationFrame(rafId)]);
};

const meta: Meta<Args> = {
  title: "3D Library/BreachBorderOverlay",
  argTypes: {
    northEdge:  { control: "boolean" },
    eastEdge:   { control: "boolean" },
    southEdge:  { control: "boolean" },
    westEdge:   { control: "boolean" },
    tileCount: { control: { type: "range", min: 1, max: 8, step: 1 } },
    cameraDistance: { control: { type: "range", min: 2, max: 16, step: 0.5 } }
  },
  args: {
    northEdge: false,
    eastEdge: true,
    southEdge: true,
    westEdge: false,
    tileCount: 1,
    cameraDistance: 4
  },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const TwoEdges: Story = {};
export const AllFourEdges: Story = {
  args: { northEdge: true, eastEdge: true, southEdge: true, westEdge: true }
};
export const SingleEdge: Story = {
  args: { northEdge: false, eastEdge: false, southEdge: true, westEdge: false }
};
export const Row: Story = {
  args: { tileCount: 5, cameraDistance: 8 }
};
