import type { Meta, StoryObj } from "@storybook/html-vite";
import { createWaypointFlag } from "@client/client-map-3d-waypoint-flag/client-map-3d-waypoint-flag.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";

// Design review for multi-waypoint queueing: the first (active) waypoint
// renders at full empire-color tint and opacity; every waypoint behind it
// in the queue renders desaturated gray and dimmed, with a numbered badge
// showing its position, so a player can spot the whole queue on the map.
const EMPIRE_COLOR = "#3b82f6";
const QUEUE_GRAY = "#8b93a0";
const HALT_COLOR = "#f59e0b";

type Args = {
  cameraDistance: number;
  queueLength: number;
  halted: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0d2819" });
  const grass = createGrassGround(3);
  stage.scene.add(grass.group);

  const flags = Array.from({ length: Math.max(1, args.queueLength) }, (_, i) => createWaypointFlag());
  const disposers: Array<() => void> = [grass.dispose];

  flags.forEach((flag, i) => {
    stage.scene.add(flag.group);
    flag.group.position.set(i * 1.6, 0, 0);
    const active = i === 0;
    const isHalted = active && args.halted;
    const tint = isHalted ? HALT_COLOR : active ? EMPIRE_COLOR : QUEUE_GRAY;
    flag.setTint(tint, tint);
    flag.setOpacityScale(active ? 1 : Math.max(0.3, 0.65 - i * 0.12));
    flag.setHalted(isHalted);
    flag.setQueueNumber(active ? undefined : i + 1);
    disposers.push(flag.dispose);
  });

  let rafId = 0;
  const animate = (): void => {
    for (const flag of flags) flag.tick(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();
  disposers.push(() => cancelAnimationFrame(rafId));

  return wrapWithCleanup(stage, disposers);
};

const meta: Meta<Args> = {
  title: "3D Library/WaypointFlag",
  parameters: {
    docs: {
      description: {
        component:
          "The waypoint flag tower used for multi-waypoint queueing. Waypoint 1 (active) renders at full empire color; " +
          "waypoints 2+ render desaturated gray, dimmed, and numbered so the whole queue is visible on the map at once."
      }
    }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 3, max: 20, step: 1 } },
    queueLength: { control: { type: "range", min: 1, max: 5, step: 1 } },
    halted: { control: "boolean" }
  },
  args: { cameraDistance: 9, queueLength: 3, halted: false },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const ActiveOnly: Story = { args: { queueLength: 1, cameraDistance: 4 } };
export const QueueOfThree: Story = { args: { queueLength: 3, cameraDistance: 9 } };
export const QueueOfFive: Story = { args: { queueLength: 5, cameraDistance: 13 } };
export const ActiveHalted: Story = {
  args: { queueLength: 1, cameraDistance: 4, halted: true },
  parameters: {
    docs: { description: { story: "Active waypoint with no reachable path — turns amber and reads brighter/more urgent." } }
  }
};
