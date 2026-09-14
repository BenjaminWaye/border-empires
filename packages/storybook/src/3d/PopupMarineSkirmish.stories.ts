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
  siegeTowerBeaming: boolean;
};

// hashSeed 1 == tileHashSeed(0, 1) — the tile coordinate the "siege tower
// beaming this tile" toggle below pretends a real Siege Tower/Dread Tower is
// locked onto (see popup-marine-siege-victim.ts's tileHashSeed).
const SIEGE_TOWER_TARGET = { x: 0, y: 1 };

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

  // Debug-only tally of how many times the "battle-strike-fx" layer has
  // spawned an entry (the opening strike and/or the siege-tower kill shot
  // both use it) — lets this story's own label confirm a beam fired without
  // needing to catch the exact frame visually.
  let strikesSeen = 0;
  let prevStrikeCount = 0;

  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    const elapsed = now - startAt;
    fx.tick(now, [], [skirmish], args.siegeTowerBeaming ? SIEGE_TOWER_TARGET : undefined);
    const strikeLayer = stage.scene.getObjectByName("battle-strike-fx");
    const strikeCount = strikeLayer?.children.length ?? 0;
    if (strikeCount > prevStrikeCount) strikesSeen += strikeCount - prevStrikeCount;
    prevStrikeCount = strikeCount;
    label.textContent =
      (elapsed < APPROACH_MS
        ? `APPROACH — ${elapsed.toFixed(0)} / ${APPROACH_MS}ms — waiting still, then running to the firing line`
        : `STANDOFF — firefight cycle ${Math.floor((elapsed - APPROACH_MS) / CLASH_MS) + 1} — holding position, trading fire (no outcome yet, so no rout)`) +
      ` — beams fired: ${strikesSeen}`;
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
    cameraDistance: { control: { type: "range", min: 2, max: 12, step: 0.5 } },
    siegeTowerBeaming: { control: "boolean" }
  },
  args: {
    attackerColor: "#4fb3ff",
    defenderColor: "#ff5d5d",
    cameraDistance: 5,
    siegeTowerBeaming: false
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

/** With `siegeTowerBeaming` on, the exact defender combat resolution was
 * already going to shed in this skirmish's first firefight cycle gets a
 * blue-violet beam strike at their real death moment — see
 * popup-marine-siege-victim.ts. Watch the defender side (right); the beam
 * lands once, early in the firefight loop. */
export const KillShotCloseUp: Story = { args: { cameraDistance: 2.5, siegeTowerBeaming: true } };
