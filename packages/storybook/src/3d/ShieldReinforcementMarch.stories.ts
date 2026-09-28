import type { Meta, StoryObj } from "@storybook/html-vite";
import { createMusterOverlay } from "@client/client-map-3d-muster-overlay.js";
import { createMusterTransitOverlay, type MusterTransit } from "@client/client-map-3d-muster-transit-overlay.js";
import { createAttackOverlay } from "@client/client-map-3d-attack-overlay.js";
import { createStage, createGrassGround, wrapWithCleanup } from "../three-stage.js";

// Reactive shield reveal (docs/replenishment-update-plan.md workstream E):
// when a Hold-mode flag's shield actually matches an attacker's commitment,
// the resolved battle now names the shield tile (CombatBroadcastPayload.
// shield), and client-map-3d-capture-overlays.ts's syncMusterTransitOverlay
// reuses this exact march visual (in the defender's colour) to walk that
// flag's company from the shield tile to the fight -- the only visible
// "tell" that a shield fired, since the matched amount itself stays hidden.
// The company arrives quickly, well before the real clash+rout window ends
// (it fought this battle, it wasn't late to it), then stands at ease until
// the whole battle overlay expires and it vanishes -- same "march to a
// tile, then hold, then disappear" shape an EXPAND/claim march already has
// (see MusterTransitOverlay.stories.ts's StandAtEaseDuringClaim story).
const DEFENDER_COLOR = "#e0473c";

const PATH = [
  { x: -3, z: 1.2 },
  { x: -2, z: 0.8 },
  { x: -1, z: 0.4 },
  { x: 0, z: 0 }
];

type Args = {
  cameraDistance: number;
  marchMs: number;
  standMs: number;
  holdMs: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.85, background: "#12210f" });
  const ground = createGrassGround(6);
  stage.scene.add(ground.group);

  // The shield flag itself, sitting at the march's starting tile.
  const flagOverlay = createMusterOverlay(stage.scene);
  const transitOverlay = createMusterTransitOverlay(stage.scene);
  // Marks the tile under attack -- the same red X the game shows over a real
  // ATTACK lock, held pulsing so the destination reads clearly.
  const targetOverlay = createAttackOverlay(stage.scene, 1);

  const groundY = 0;
  const flag = PATH[0]!;
  const target = PATH[PATH.length - 1]!;

  flagOverlay.addMuster(flag.x, flag.z, groundY, 1, DEFENDER_COLOR, true, 0, 0);
  flagOverlay.commit();

  const disposers: Array<() => void> = [ground.dispose, flagOverlay.dispose, transitOverlay.dispose, targetOverlay.dispose];

  let cycleStart = performance.now();
  const cycleMs = args.marchMs + args.standMs + args.holdMs;

  // Mirrors the real wiring: startAt = the battle's clashAt, arriveAt =
  // shortly after (well inside CLASH_MS in-game), standUntil = the battle's
  // endAt -- arrives fast, stands through the rest of the fight, then gone.
  const spawnReinforcement = (nowMs: number): MusterTransit => ({
    path: PATH,
    groundY,
    startAt: nowMs,
    arriveAt: nowMs + args.marchMs,
    standUntil: nowMs + args.marchMs + args.standMs,
    ownerColor: DEFENDER_COLOR
  });

  let transit = spawnReinforcement(cycleStart);

  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    if (now - cycleStart >= cycleMs) {
      cycleStart = now;
      transit = spawnReinforcement(now);
    }

    transitOverlay.clear();
    transitOverlay.addTransit(transit);
    transitOverlay.commit();
    transitOverlay.tick(now);

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
  title: "3D Library/ShieldReinforcementMarch",
  parameters: {
    docs: {
      description: {
        component:
          "Design review for the shield-reveal visual: when an attack is matched by a defending flag's shield, that flag's " +
          "company marches from the shield tile to the tile under attack, in the defender's colour, arriving quickly -- " +
          "already there once the firefight is under way, not showing up only as the dust settles -- then stands at ease " +
          "until the fight resolves and the whole overlay vanishes. This is the only visible sign a shield fired; the " +
          "matched amount itself is never shown (the win-chance preview isn't corrected for it either, by design -- see " +
          "docs/replenishment-update-plan.md workstream E). Distance/pacing are illustrative; the real march is timed to " +
          "the resolved battle's own clash+rout window (client-map-3d-capture-overlays.ts's syncMusterTransitOverlay)."
      }
    }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 4, max: 24, step: 1 } },
    marchMs: { control: { type: "range", min: 250, max: 2000, step: 100 } },
    standMs: { control: { type: "range", min: 0, max: 3000, step: 250 } },
    holdMs: { control: { type: "range", min: 0, max: 3000, step: 250 } }
  },
  args: { cameraDistance: 7, marchMs: 500, standMs: 1650, holdMs: 950 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};
export const SlowMarch: Story = {
  args: { marchMs: 2000, standMs: 2000, cameraDistance: 9 },
  parameters: {
    docs: { description: { story: "Slowed down for inspection -- the real march arrives in well under half a second." } }
  }
};
