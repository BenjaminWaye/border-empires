import type { Meta, StoryObj } from "@storybook/html-vite";
import { createMusterOverlay } from "@client/client-map-3d-muster-overlay.js";
import { createMusterTransitOverlay, type MusterTransit } from "@client/client-map-3d-muster-transit-overlay.js";
import { createSupplyLineOverlay } from "@client/client-map-3d-supply-line-overlay.js";
import { createAttackOverlay } from "@client/client-map-3d-attack-overlay.js";
import { createStage, createGrassGround, wrapWithCleanup } from "../three-stage.js";

// Design review for the muster travel-time visualization: a company of
// soldier-dot instances (the same silhouette the muster tower uses for
// troops assembling) marches from the flag tile to the tile it's attacking,
// along the route the (existing) supply-line overlay already draws. The
// attack overlay's red X marks the target, exactly as it does in-game once
// a real ATTACK lock exists — here it's just held pulsing throughout the
// march so the destination reads clearly before the company arrives.
const EMPIRE_COLOR = "#3fa9f5";
const HOPS = 6;

type Args = {
  cameraDistance: number;
  marchMs: number;
  holdMs: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.85, background: "#12210f" });
  const ground = createGrassGround(4);
  stage.scene.add(ground.group);

  const flagOverlay = createMusterOverlay(stage.scene);
  const transitOverlay = createMusterTransitOverlay(stage.scene);
  const supplyLine = createSupplyLineOverlay(stage.scene);
  const targetOverlay = createAttackOverlay(stage.scene, 1);

  // Flag sits at the origin tile; target sits HOPS tiles away along a
  // slightly bent route (grass ground is laid out 1 world unit = 1 tile).
  const fromX = -HOPS / 2, fromZ = 0.6;
  const toX = HOPS / 2, toZ = -0.6;
  const groundY = 0;

  flagOverlay.addMuster(fromX, fromZ, groundY, 1, EMPIRE_COLOR, true, 0, 0);
  flagOverlay.commit();

  supplyLine.addLine(fromX, fromZ, groundY, toX, toZ, groundY, "transit", EMPIRE_COLOR);
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
    fromX, fromZ, toX, toZ, groundY,
    startAt: nowMs, arriveAt: nowMs + args.marchMs, ownerColor: EMPIRE_COLOR
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
    targetOverlay.addInstance(toX, toZ, groundY, cycleStart + cycleMs);
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
          "Travel-time concept using real game assets: a company marches from the muster flag (client-map-3d-muster-overlay tower) " +
          "along the supply line (client-map-3d-supply-line-overlay) to the attacked tile (client-map-3d-attack-overlay's target X), " +
          "then loops. Distance/pacing are illustrative — this is the design review for the visualization itself, not final combat balance."
      }
    }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 4, max: 20, step: 1 } },
    marchMs: { control: { type: "range", min: 1000, max: 8000, step: 250 } },
    holdMs: { control: { type: "range", min: 0, max: 4000, step: 250 } }
  },
  args: { cameraDistance: 9, marchMs: 4200, holdMs: 1400 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};
export const FastMarch: Story = { args: { marchMs: 1800, holdMs: 800 } };
export const SlowMarch: Story = { args: { marchMs: 7000, holdMs: 2000, cameraDistance: 12 } };
