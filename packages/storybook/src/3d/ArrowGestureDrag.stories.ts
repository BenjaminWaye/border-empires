import type { Meta, StoryObj } from "@storybook/html-vite";
import { createMusterOverlay } from "@client/client-map-3d-muster-overlay.js";
import { createArrowOverlay } from "@client/client-map-3d-arrow-overlay.js";
import { createWinChancePaintOverlay, type WinChancePaintEntry } from "@client/client-map-3d-win-chance-paint-overlay.js";
import { winChanceColor } from "@border-empires/shared";
import { createStage, createGrassGround, wrapWithCleanup } from "../three-stage.js";

// Workstream F1/F2 (docs/replenishment-update-plan.md): design review for the
// right-click-drag (desktop) / long-press-drag (mobile) attack gesture --
// drag a straight arrow from an owned muster flag's tile to a target tile,
// with the win-chance paint (F0) live-updating on the tile currently under
// the drag's endpoint, exactly as client-map-input-arrow-gesture-wiring.ts /
// client-map-input-arrow-gesture-touch-wiring.ts drive it frame-by-frame in
// the real client. This story fakes the drag with a looping animation
// instead of real pointer input so it can be watched hands-free.
const FLAG_COLOR = "#4a90ff";
const ORIGIN = { x: -2.5, z: 0 };
const TARGET = { x: 2.5, z: 0.6 };

type Args = {
  cameraDistance: number;
  dragMs: number;
  holdAtTargetMs: number;
  pauseAtOriginMs: number;
};

// Illustrative win chance that rises the further along the arrow a labeled
// tile sits, purely so the labels' red->amber->green sweep is visible --
// the real client computes each tile's own winChanceForTile independently
// (client-win-chance-paint-trigger.ts), not from position along the line.
const winChanceForProgress = (t: number): number => Math.min(1, Math.max(0, t));

const labelEntryFor = (x: number, z: number, t: number): WinChancePaintEntry => {
  const winChance = winChanceForProgress(t);
  return { sceneX: x, sceneZ: z, surfaceY: 0, winChance, color: winChanceColor(winChance) };
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.85, background: "#12210f" });
  const ground = createGrassGround(6);
  stage.scene.add(ground.group);

  const flagOverlay = createMusterOverlay(stage.scene);
  const arrowOverlay = createArrowOverlay(stage.scene);
  const paintOverlay = createWinChancePaintOverlay(stage.scene);

  flagOverlay.addMuster(ORIGIN.x, ORIGIN.z, 0, 1, FLAG_COLOR, false, 0, 0);
  flagOverlay.commit();

  const disposers: Array<() => void> = [ground.dispose, flagOverlay.dispose, arrowOverlay.dispose, paintOverlay.dispose];

  const cycleMs = args.pauseAtOriginMs + args.dragMs + args.holdAtTargetMs;
  let cycleStart = performance.now();

  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    let elapsed = now - cycleStart;
    if (elapsed >= cycleMs) {
      cycleStart = now;
      elapsed = 0;
    }

    // Drag progress: sits at the origin, eases out to the target, holds there.
    let t = 0;
    if (elapsed >= args.pauseAtOriginMs) {
      const dragElapsed = Math.min(args.dragMs, elapsed - args.pauseAtOriginMs);
      const linear = dragElapsed / args.dragMs;
      t = 1 - (1 - linear) * (1 - linear); // ease-out, matches a real drag decelerating near release
    }

    const currentX = ORIGIN.x + (TARGET.x - ORIGIN.x) * t;
    const currentZ = ORIGIN.z + (TARGET.z - ORIGIN.z) * t;

    // Real design (post-feedback): a "XX%" label on every enemy tile the
    // arrow crosses, not a tinted square at the target + its neighbors --
    // illustrated here with a handful of evenly-spaced integer tiles along
    // the origin->current line, standing in for tilesAlongLine's Bresenham
    // trace (client-win-chance-paint-trigger.ts) over a real (terrain-less)
    // stage.
    paintOverlay.clear();
    if (t > 0.02) {
      const steps = Math.max(1, Math.round(t * 5));
      for (let i = 1; i <= steps; i++) {
        const st = (i / steps) * t;
        const x = ORIGIN.x + (TARGET.x - ORIGIN.x) * st;
        const z = ORIGIN.z + (TARGET.z - ORIGIN.z) * st;
        paintOverlay.addTile(labelEntryFor(x, z, st));
      }
    }
    paintOverlay.commit();

    arrowOverlay.clear();
    if (t > 0.02) {
      arrowOverlay.setEndpoints(
        { sceneX: ORIGIN.x, sceneZ: ORIGIN.z, surfaceY: 0 },
        { sceneX: currentX, sceneZ: currentZ, surfaceY: 0 }
      );
    }
    arrowOverlay.commit();

    rafId = requestAnimationFrame(animate);
  };
  animate();
  disposers.push(() => cancelAnimationFrame(rafId));

  return wrapWithCleanup(stage, disposers);
};

const meta: Meta<Args> = {
  title: "3D Library/ArrowGestureDrag",
  parameters: {
    docs: {
      description: {
        component:
          "Design review for the arrow-gesture attack UX (Workstream F1/F2): right-click-drag on desktop or long-press+" +
          "drag on mobile paints a straight arrow from an owned muster flag's tile to wherever the drag currently is, " +
          "with a win-chance percentage label (dark shadow, color-coded red/amber/green) floating above every enemy " +
          "tile the arrow crosses (F0, redesigned from an earlier tinted-square version). On release this opens the " +
          "confirm sheet (size slider + Normal/Extra/Double presets) which sends the real SET_MUSTER command -- not " +
          "shown here, this story is only the drag visual. The drag itself is faked with a looping ease-out animation " +
          "instead of real pointer input so it can be watched hands-free; pacing is illustrative, not timed to any " +
          "real input latency."
      }
    }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 4, max: 20, step: 1 } },
    dragMs: { control: { type: "range", min: 200, max: 2500, step: 100 } },
    holdAtTargetMs: { control: { type: "range", min: 0, max: 2000, step: 100 } },
    pauseAtOriginMs: { control: { type: "range", min: 0, max: 1500, step: 100 } }
  },
  args: { cameraDistance: 9, dragMs: 900, holdAtTargetMs: 700, pauseAtOriginMs: 400 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const SlowDrag: Story = {
  args: { dragMs: 2500, holdAtTargetMs: 1200, pauseAtOriginMs: 600, cameraDistance: 11 },
  parameters: {
    docs: { description: { story: "Slowed down for inspection -- watch the arrow lengthen and the win-chance labels sweep from red to green as the drag travels." } }
  }
};

export const QuickFlick: Story = {
  args: { dragMs: 300, holdAtTargetMs: 400, pauseAtOriginMs: 150, cameraDistance: 9 },
  parameters: {
    docs: { description: { story: "A fast drag, closer to how it actually feels in the real client." } }
  }
};
