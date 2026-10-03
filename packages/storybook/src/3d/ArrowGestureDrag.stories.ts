import type { Meta, StoryObj } from "@storybook/html-vite";
import { createMusterOverlay } from "@client/client-map-3d-muster-overlay.js";
import { createArrowOverlay } from "@client/client-map-3d-arrow-overlay.js";
import { createWinChancePaintOverlay, type WinChancePaintEntry } from "@client/client-map-3d-win-chance-paint-overlay.js";
import { winChanceColor } from "@border-empires/shared";
import { createStage, createGrassGround, wrapWithCleanup } from "../three-stage.js";

// Workstream F, revised (docs/replenishment-update-plan.md, "the hold-drag
// gesture is replaced by click-to-target"): design review for the attack
// arrow + win-chance labels as they actually work today -- click a muster
// flag, click "March To", click a target tile (ordinary decoupled clicks,
// free panning in between, no held button or long-press). The arrow is then
// STATIC (origin and target are both already fixed) while the confirm
// sheet is open, and the win-chance labels along it are slider-live: this
// story illustrates that by looping the "chosen commitment" the confirm
// sheet's manpower slider would report, through its low/normal/high range,
// recomputing the labels each time -- the arrow itself never moves, only
// the numbers change, since there is no drag to animate anymore.
const FLAG_COLOR = "#4a90ff";
const ORIGIN = { x: -2.5, z: 0 };
const TARGET = { x: 2.5, z: 0.6 };
// Tiles a straight line from ORIGIN to TARGET would cross (illustrative
// integer points standing in for tilesAlongLine's Bresenham trace,
// client-win-chance-paint-trigger.ts, over a real terrain-less stage).
const LABEL_FRACTIONS = [0.25, 0.5, 0.75, 1];

type Args = {
  cameraDistance: number;
  sliderCycleMs: number;
};

// Illustrative: as if the confirm sheet's manpower slider swept low -> high
// and back, each label's win chance rising with the chosen commitment --
// client-win-chance-paint-trigger.ts's real recompute is driven by the
// sheet's actual commitManpower input, not by time.
const winChanceForSliderPhase = (labelFraction: number, sliderPhase: number): number =>
  Math.min(1, Math.max(0, sliderPhase * (0.4 + labelFraction * 0.6)));

const labelEntryFor = (x: number, z: number, winChance: number): WinChancePaintEntry => ({
  sceneX: x,
  sceneZ: z,
  surfaceY: 0,
  winChance,
  color: winChanceColor(winChance)
});

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.85, background: "#12210f" });
  const ground = createGrassGround(6);
  stage.scene.add(ground.group);

  const flagOverlay = createMusterOverlay(stage.scene);
  const arrowOverlay = createArrowOverlay(stage.scene);
  const paintOverlay = createWinChancePaintOverlay(stage.scene);

  flagOverlay.addMuster(ORIGIN.x, ORIGIN.z, 0, 1, FLAG_COLOR, false, 0, 0);
  flagOverlay.commit();

  // Static: set once, never updated -- the target was already fixed by an
  // ordinary click before the sheet (and this story) ever appears.
  arrowOverlay.setEndpoints({ sceneX: ORIGIN.x, sceneZ: ORIGIN.z, surfaceY: 0 }, { sceneX: TARGET.x, sceneZ: TARGET.z, surfaceY: 0 });
  arrowOverlay.commit();

  const disposers: Array<() => void> = [ground.dispose, flagOverlay.dispose, arrowOverlay.dispose, paintOverlay.dispose];

  let cycleStart = performance.now();

  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    let elapsed = now - cycleStart;
    if (elapsed >= args.sliderCycleMs) {
      cycleStart = now;
      elapsed = 0;
    }
    // Low -> high -> low, a triangle wave standing in for a player dragging
    // the slider up then back down.
    const t = elapsed / args.sliderCycleMs;
    const sliderPhase = t < 0.5 ? t * 2 : 2 - t * 2;

    paintOverlay.clear();
    for (const fraction of LABEL_FRACTIONS) {
      const x = ORIGIN.x + (TARGET.x - ORIGIN.x) * fraction;
      const z = ORIGIN.z + (TARGET.z - ORIGIN.z) * fraction;
      paintOverlay.addTile(labelEntryFor(x, z, winChanceForSliderPhase(fraction, sliderPhase)));
    }
    paintOverlay.commit();

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
          "Design review for the attack-arrow + win-chance-label UX (Workstream F, revised): the target is picked by " +
          "ordinary clicks (flag -> March To -> target tile), not a held drag, so the arrow drawn here is STATIC -- " +
          "fixed the moment this story 'opens', same as it would be once the real confirm sheet appears. What animates " +
          "is the win-chance percentage labels (dark shadow, red/amber/green) along the arrow, standing in for the " +
          "confirm sheet's manpower slider being moved: each label recomputes against the chosen commitment, exactly " +
          "as client-win-chance-paint-trigger.ts's real trigger does on every slider/preset change. The confirm sheet " +
          "itself (manpower slider + Normal/Extra/Double presets + Go, sending the real SET_MUSTER command) is not " +
          "shown here -- this story is only the map visual."
      }
    }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 4, max: 20, step: 1 } },
    sliderCycleMs: { control: { type: "range", min: 800, max: 6000, step: 200 } }
  },
  args: { cameraDistance: 9, sliderCycleMs: 2400 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const SlowSliderSweep: Story = {
  args: { sliderCycleMs: 6000, cameraDistance: 11 },
  parameters: {
    docs: { description: { story: "Slowed down for inspection -- watch each label's win chance rise and fall together as the (illustrative) commitment sweeps low to high and back, while the arrow itself never moves." } }
  }
};
