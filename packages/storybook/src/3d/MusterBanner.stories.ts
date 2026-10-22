import type { Meta, StoryObj } from "@storybook/html-vite";
import { createMusterOverlay } from "@client/client-map-3d-muster-overlay.js";
import { createTownOverlay } from "@client/client-map-3d-town-overlay.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  advance: boolean;
  fillRatio: number;
  besideSettlement: boolean;
  /** < 0: no parked attack. Otherwise how far a parked manual attack on each flag has filled (staggered per flag). */
  parkedAttackProgress: number;
};

const EMPIRE_COLORS = ["#d23c3c", "#3a7bd5", "#e0b030", "#46a35a", "#9b59b6"];

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.85, background: "#12210f" });
  const ground = createGrassGround(4);
  stage.scene.add(ground.group);

  // Same key shape client-map-3d.ts passes (`${x},${y}` world tile keys).
  const parkedRatios = new Map(
    args.parkedAttackProgress < 0 ? [] : EMPIRE_COLORS.map((_, i) => [`${i},0`, Math.min(1, args.parkedAttackProgress * (0.4 + i * 0.3))] as const)
  );
  const overlay = createMusterOverlay(stage.scene, undefined, () => parkedRatios);
  EMPIRE_COLORS.forEach((color, i) => {
    const x = (i - (EMPIRE_COLORS.length - 1) / 2) * 1.1;
    overlay.addMuster(x, 0, 0, args.fillRatio, color, args.advance, i, 0);
  });
  overlay.commit();

  const cleanups: Array<() => void> = [ground.dispose, overlay.dispose];
  if (args.besideSettlement) {
    const towns = createTownOverlay(stage.scene, 1);
    towns.addInstance(0, -1.2, 0, "SETTLEMENT");
    towns.commit();
    cleanups.push(towns.dispose);
  }

  let rafId = 0;
  const animate = (): void => {
    overlay.tick(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();
  cleanups.push(() => cancelAnimationFrame(rafId));

  return wrapWithCleanup(stage, cleanups);
};

const meta: Meta<Args> = {
  title: "3D Library/Muster Banner",
  parameters: {
    docs: {
      description: {
        component: [
          "The mustering marker (createMusterOverlay): a board-game war banner on the towns' octagonal stone-and-brass plate,",
          "with an enamel band and inlaid ring in the owner's colour. The swallowtail cloth, in the owner's colour with a brass",
          "trim and cog device, ripples in the wind in its shader; ADVANCE banners are brighter and whip faster.",
          "Soldier dots march in from the tile's edges, denser as the flag fills.",
          "A manual attack parked on a flag, still gathering manpower, floats a brass percentage badge above its banner",
          "(client-map-3d-muster-progress-badge.ts) in place of the old full-width \"Mustering...\" banner."
        ].join("\n")
      }
    }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 1.5, max: 12, step: 0.5 } },
    advance: { control: "boolean" },
    fillRatio: { control: { type: "range", min: 0, max: 1, step: 0.05 } },
    besideSettlement: { control: "boolean" },
    parkedAttackProgress: { control: { type: "range", min: -1, max: 1, step: 0.05 } }
  },
  args: { cameraDistance: 5, advance: false, fillRatio: 0.6, besideSettlement: true, parkedAttackProgress: -1 },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const Lineup: Story = {};
export const CloseUp: Story = { args: { cameraDistance: 2.2, besideSettlement: false } };
export const Advance: Story = { args: { advance: true, fillRatio: 1 } };
export const ParkedAttackBadges: Story = { args: { parkedAttackProgress: 0.8, besideSettlement: false } };
