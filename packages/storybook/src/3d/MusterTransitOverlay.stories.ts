import type { Meta, StoryObj } from "@storybook/html-vite";
import { createMusterOverlay } from "@client/client-map-3d-muster-overlay.js";
import { createMusterTransitOverlay, type MusterTransit, type MusterTransitHop } from "@client/client-map-3d-muster-transit-overlay.js";
import { createSupplyLineOverlay } from "@client/client-map-3d-supply-line-overlay.js";
import { createAttackOverlay } from "@client/client-map-3d-attack-overlay.js";
import { createStage, createGrassGround, wrapWithCleanup } from "../three-stage.js";

// Design review for the muster travel-time visualization: a company of dot
// instances (the same round-dot look the skirmish/battle overlay uses for
// combatants — client-map-3d-popup-marine/popup-marine-overlay-fx.ts) marches hop-by-hop along
// the real owned-territory route from the flag tile to the attacked tile,
// never cutting a straight line across tiles as if they weren't there. The
// attack overlay's red X marks the target, exactly as it does in-game once a
// real ATTACK lock exists — here it's held pulsing throughout the march so
// the destination reads clearly before the company arrives.
const EMPIRE_COLOR = "#3fa9f5";

// A real tile-by-tile route: every consecutive pair is exactly one
// Chebyshev-adjacent hop (never a diagonal skip across untouched tiles),
// bending around a rise in the ground the way a BFS-found path through
// owned territory actually would.
const LAND_PATH: MusterTransitHop[] = [
  { x: -3, z: 0.6 },
  { x: -2, z: 0.6 },
  { x: -1, z: 0.3 },
  { x: 0, z: 0 },
  { x: 1, z: -0.3 },
  { x: 2, z: -0.3 },
  { x: 3, z: -0.6 }
];

// Same route, but the middle hop is a dock crossing — a single hop that
// covers a much longer real distance, exactly like an ADVANCE flag firing
// across a paired dock (see runtime-muster-tick.ts's dock-hop test). The
// company should visibly dash across that one hop faster/further than the
// others, not have the whole march's pacing stretched to account for it.
const DOCK_PATH: MusterTransitHop[] = [
  { x: -3, z: 0.6 },
  { x: -2, z: 0.6 },
  { x: -1, z: 0.3 },
  { x: 5, z: -2.5 }, // far shore of the dock link — one hop, large real distance
  { x: 6, z: -2.5 },
  { x: 7, z: -2.8 }
];

type Args = {
  cameraDistance: number;
  marchMs: number;
  holdMs: number;
  dockCrossing: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.85, background: "#12210f" });
  const ground = createGrassGround(6);
  stage.scene.add(ground.group);

  const flagOverlay = createMusterOverlay(stage.scene);
  const transitOverlay = createMusterTransitOverlay(stage.scene);
  const supplyLine = createSupplyLineOverlay(stage.scene);
  const targetOverlay = createAttackOverlay(stage.scene, 1);

  const groundY = 0;
  const path = args.dockCrossing ? DOCK_PATH : LAND_PATH;
  const flag = path[0]!;
  const target = path[path.length - 1]!;

  flagOverlay.addMuster(flag.x, flag.z, groundY, 1, EMPIRE_COLOR, true, 0, 0);
  flagOverlay.commit();

  // One line segment per hop, so the route itself reads as tile-by-tile too,
  // not a single beeline from flag to target.
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i]!, to = path[i + 1]!;
    supplyLine.addLine(from.x, from.z, groundY, to.x, to.z, groundY, "transit", EMPIRE_COLOR);
  }
  supplyLine.commit();

  const disposers: Array<() => void> = [
    ground.dispose,
    flagOverlay.dispose,
    transitOverlay.dispose,
    supplyLine.dispose,
    targetOverlay.dispose
  ];

  let cycleStart = performance.now();
  const cycleMs = args.marchMs + args.holdMs;

  const spawnCompany = (nowMs: number): MusterTransit => ({
    path, groundY, startAt: nowMs, arriveAt: nowMs + args.marchMs, ownerColor: EMPIRE_COLOR
  });

  let transit = spawnCompany(cycleStart);

  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    if (now - cycleStart >= cycleMs) {
      cycleStart = now;
      transit = spawnCompany(now);
    }

    transitOverlay.clear();
    transitOverlay.addTransit(transit);
    transitOverlay.commit();
    transitOverlay.tick(now);

    supplyLine.tick(now);

    targetOverlay.clear();
    targetOverlay.addInstance(target.x, target.z, groundY, cycleStart + cycleMs);
    targetOverlay.commit();
    targetOverlay.tick(now);

    rafId = requestAnimationFrame(animate);
  };
  animate();
  disposers.push(() => cancelAnimationFrame(rafId));

  return wrapWithCleanup(stage, disposers);
};

const meta: Meta<Args> = {
  title: "3D Library/MusterTransitOverlay",
  parameters: {
    docs: {
      description: {
        component:
          "Travel-time concept using real game assets: a company marches hop-by-hop from the muster flag " +
          "(client-map-3d-muster-overlay tower) along the real tile route (client-map-3d-supply-line-overlay, one segment per hop) " +
          "to the attacked tile (client-map-3d-attack-overlay's target X), then loops. The DockCrossing story shows a route with " +
          "one long dock hop, which the company dashes across in the same time as any other single hop, never stretching the " +
          "whole march to account for it. Distance/pacing are illustrative — this is the design review for the visualization " +
          "itself, not final combat balance."
      }
    }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 4, max: 24, step: 1 } },
    marchMs: { control: { type: "range", min: 1000, max: 8000, step: 250 } },
    holdMs: { control: { type: "range", min: 0, max: 4000, step: 250 } },
    dockCrossing: { control: "boolean" }
  },
  args: { cameraDistance: 9, marchMs: 4200, holdMs: 1400, dockCrossing: false },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};
export const FastMarch: Story = { args: { marchMs: 1800, holdMs: 800 } };
export const SlowMarch: Story = { args: { marchMs: 7000, holdMs: 2000, cameraDistance: 12 } };
export const DockCrossing: Story = {
  args: { dockCrossing: true, cameraDistance: 14 },
  parameters: {
    docs: { description: { story: "One hop in the route is a dock crossing — same per-hop time budget as any other hop, so the company dashes across it." } }
  }
};
