import type { Meta, StoryObj } from "@storybook/html-vite";
import { Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import {
  createPopupMarineOverlayFx,
  APPROACH_MS,
  CLASH_MS,
  type BattleOverlaySkirmishEntry
} from "@client/client-map-3d-popup-marine/popup-marine-overlay-fx.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// The SKIRMISH loop on its own: a siege whose outcome the server has not
// decided yet.
//
// This is the same code path the real client runs while a siege is counting
// down (see client-battle-overlay.ts's skirmishSeenAt, and
// computeSkirmishPose in popup-marine-timeline.ts) — it is not a
// demonstration mock. It differs from a resolved battle in exactly one way:
// there is no outcome, so there is no rout. The squads approach once, halt,
// and then trade fire indefinitely, shedding only the first cycle's
// casualties. That makes it the story to use when judging the standing
// firefight itself — stances, spacing, muzzle flashes, bolts and impact
// sparks — without the approach and rout scrolling past.
//
// PopupMarineOverlayFx/FullAttackLifecycle shows this phase handing over to
// a resolved battle; this story just lets it run.

const TILE_GAP = 2.4;

type Args = {
  attackerColor: string;
  defenderColor: string;
  cameraDistance: number;
};

const makeTerritoryTile = (x: number, color: string): Mesh => {
  const tile = new Mesh(
    new PlaneGeometry(1.6, 1.6),
    new MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, transparent: true, opacity: 0.35 })
  );
  tile.rotation.x = -Math.PI / 2;
  tile.position.set(x, -0.01, 0);
  return tile;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0d0f16" });
  const fx = createPopupMarineOverlayFx(stage.scene);

  const attackerTile = makeTerritoryTile(-TILE_GAP / 2, args.attackerColor);
  const defenderTile = makeTerritoryTile(TILE_GAP / 2, args.defenderColor);
  stage.scene.add(attackerTile, defenderTile);

  const startAt = performance.now();
  const skirmish: BattleOverlaySkirmishEntry = {
    srcWorldX: -TILE_GAP / 2,
    srcWorldZ: 0,
    tgtWorldX: TILE_GAP / 2,
    tgtWorldZ: 0,
    srcSurfaceY: 0,
    tgtSurfaceY: 0,
    attackerColor: args.attackerColor,
    defenderColor: args.defenderColor,
    startAt,
    hashSeed: 1
  };

  const label = document.createElement("div");
  label.style.position = "absolute";
  label.style.bottom = "12px";
  label.style.left = "12px";
  label.style.color = "#cbd5e1";
  label.style.font = "12px monospace";
  label.style.background = "rgba(13,15,22,0.75)";
  label.style.padding = "6px 10px";
  label.style.borderRadius = "4px";

  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    const elapsed = now - startAt;
    label.textContent =
      elapsed < APPROACH_MS
        ? `APPROACH — ${elapsed.toFixed(0)} / ${APPROACH_MS}ms — waiting still, then running to the firing line`
        : `STANDOFF — firefight cycle ${Math.floor((elapsed - APPROACH_MS) / CLASH_MS) + 1} — holding position, trading fire (no outcome yet, so no rout)`;
    fx.tick(now, [], [skirmish]);
    rafId = requestAnimationFrame(animate);
  };
  animate();

  const stageEl = wrapWithCleanup(stage, [
    () => {
      cancelAnimationFrame(rafId);
      fx.dispose();
      attackerTile.geometry.dispose();
      (attackerTile.material as MeshStandardMaterial).dispose();
      defenderTile.geometry.dispose();
      (defenderTile.material as MeshStandardMaterial).dispose();
    }
  ]);
  stageEl.appendChild(label);
  return stageEl;
};

const meta: Meta<Args> = {
  title: "3D Library/PopupMarineSkirmish",
  argTypes: {
    attackerColor: { control: "color" },
    defenderColor: { control: "color" },
    cameraDistance: { control: { type: "range", min: 2, max: 12, step: 0.5 } }
  },
  args: {
    attackerColor: "#4fb3ff",
    defenderColor: "#ff5d5d",
    cameraDistance: 5
  },
  render
};

export default meta;
type Story = StoryObj<Args>;

/** The endless standing firefight — the phase a besieged tile sits in until
 * the server resolves it. */
export const Standoff: Story = {};

/** Same loop, camera pulled in close enough to read individual stances,
 * muzzle flashes and impact sparks. */
export const StandoffCloseUp: Story = { args: { cameraDistance: 2.5 } };
