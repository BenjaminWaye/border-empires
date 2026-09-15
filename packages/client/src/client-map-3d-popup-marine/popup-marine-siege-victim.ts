// Attributes an already-scheduled defender casualty to a siege tower that is
// actively beaming that tile's battle, so the tower's lance visibly opens
// the fight by taking out a specific unit right as combat starts. This
// NEVER invents a death or changes WHO dies — dyingIndicesFor/deathKitFor in
// popup-marine-timeline.ts remain the single source of truth for which
// marines fall (a pure function of the server-resolved outcome). It only
// picks WHICH already-dying defender to attribute to the tower and pins
// WHEN their fall visually happens to the instant combat begins (via
// computeBattlePose/computeSkirmishPose's own siegeVictimIndex parameter,
// which forces that one marine's death-roll `at` to 0) instead of their own
// random roll, so the beam's impact and their collapse always land together
// at the start of the fight.
import {
  APPROACH_MS,
  clampLocal,
  deathKitFor,
  dyingIndicesFor,
  marineKitFor,
  stopOffsetFor,
  type BattleOverlayRenderEntry,
  type BattleOverlaySkirmishEntry
} from "./popup-marine-timeline.js";
import type { BattleStrikeFxLayer } from "./popup-marine-strike-fx.js";

const DEFENDER_SIDE = 1 as const;

export type SiegeVictim = {
  /** Marine index (0..MARINES_PER_SIDE) on the defending side. */
  readonly index: number;
  /** Real-clock (nowMs) moment combat starts for this entry — where the
   * beam fires and this marine's fall begins (forced to `at = 0`). */
  readonly deathAtMs: number;
};

/** The tile-coordinate hash every BattleOverlayRenderEntry/
 * BattleOverlaySkirmishEntry's hashSeed is built from (see
 * client-map-3d-capture-overlays.ts) — exported so a raw siege-tower aim
 * target {x,y} can be compared against an entry's hashSeed without
 * duplicating the formula a third time. */
export const tileHashSeed = (x: number, y: number): number => x * 92821 + y;

/** The lowest-roll (most "fated") defender in a dying set — dyingIndicesFor
 * builds its Set from an ascending-roll sort, so the first entry IS that
 * marine; this just names the intent instead of relying on iteration order
 * silently. Deterministic and stable for a given hashSeed regardless of
 * which marine would have naturally died first in time. */
const mostFatedVictim = (dyingSet: ReadonlySet<number>): number | undefined => dyingSet.values().next().value;

/** The defender a siege tower actively beaming this SKIRMISH's tile opens
 * the fight by taking out. The pre-resolution loop always sheds exactly one
 * defender (WINNER_DEATHS) during its first firefight cycle regardless of
 * the eventual outcome (see computeSkirmishPose) — that marine is always the
 * one attributed here, forced to fall the instant the firefight begins. */
export const skirmishSiegeVictim = (
  b: Pick<BattleOverlaySkirmishEntry, "hashSeed" | "startAt" | "holdApproachUntilElapsed">
): SiegeVictim | undefined => {
  const dyingSet = dyingIndicesFor((side, i) => deathKitFor(b.hashSeed, side, i), DEFENDER_SIDE, true);
  const index = mostFatedVictim(dyingSet);
  if (index === undefined) return undefined;
  const approachMs = Math.max(APPROACH_MS, b.holdApproachUntilElapsed ?? 0);
  return { index, deathAtMs: b.startAt + approachMs };
};

/** The defender a siege tower actively beaming this RESOLVED battle's tile
 * opens the fight by taking out. Undefined for a battle continuing a
 * skirmish (fromSkirmish) — that defender's death, if any, was already
 * attributed during the skirmish phase above, and attributing it again here
 * would replay the same "kill" a second time once the battle resolves. */
export const battleSiegeVictim = (
  b: Pick<BattleOverlayRenderEntry, "hashSeed" | "clashAt" | "attackerWon" | "fromSkirmish">
): SiegeVictim | undefined => {
  if (b.fromSkirmish) return undefined;
  const defenderWon = !b.attackerWon;
  const dyingSet = dyingIndicesFor((side, i) => deathKitFor(b.hashSeed, side, i), DEFENDER_SIDE, defenderWon);
  const index = mostFatedVictim(dyingSet);
  if (index === undefined) return undefined;
  return { index, deathAtMs: b.clashAt };
};

// A small window (matching DEATH_FADE_T's real duration, ~0.16 * CLASH_MS)
// rather than a single exact frame, so a slow tick or a backgrounded tab
// doesn't skip the beam entirely for landing a frame late.
const SIEGE_KILL_FIRE_WINDOW_MS = 220;

export type SiegeKillTracker = {
  /** Fires the siege-tower "kill shot" beam on `victim` exactly once, right
   * as their already-scheduled fall begins — this never decides who dies,
   * only attributes an existing casualty to the tower and times a
   * beam-impact effect to it. `ux`/`uz` is the attacker->defender unit
   * direction for this entry (the caller already has it); the defender's
   * own forward axis is its negation, which is where the position math
   * below comes from (mirrors computeBattlePose/computeSkirmishPose's own
   * firingX/firingZ). */
  readonly fire: (
    key: string,
    hashSeed: number,
    victim: SiegeVictim | undefined,
    tileX: number, tileY: number, tileZ: number,
    perpX: number, perpZ: number, ux: number, uz: number,
    nowMs: number
  ) => void;
  /** Drops dedup entries whose fire window has fully closed, so this never
   * grows unbounded over a long session. */
  readonly prune: (nowMs: number) => void;
  readonly clear: () => void;
};

/** Owns the dedup bookkeeping for `fire` above, keyed by caller-chosen
 * string (e.g. "bk:<hashSeed>" for a resolved battle, "sk:<hashSeed>" for a
 * skirmish — see popup-marine-overlay-fx.ts). */
export const createSiegeKillTracker = (strikeFx: Pick<BattleStrikeFxLayer, "spawn">): SiegeKillTracker => {
  const firedAt = new Map<string, number>();

  const fire: SiegeKillTracker["fire"] = (key, hashSeed, victim, tileX, tileY, tileZ, perpX, perpZ, ux, uz, nowMs) => {
    if (!victim) return;
    if (firedAt.get(key) === victim.deathAtMs) return;
    if (nowMs < victim.deathAtMs || nowMs >= victim.deathAtMs + SIEGE_KILL_FIRE_WINDOW_MS) return;
    firedAt.set(key, victim.deathAtMs);
    const kit = marineKitFor(hashSeed, DEFENDER_SIDE, victim.index);
    const offset = stopOffsetFor(kit);
    const localX = clampLocal(perpX * kit.perpPos + ux * offset);
    const localZ = clampLocal(perpZ * kit.perpPos + uz * offset);
    strikeFx.spawn(tileX + localX, tileZ + localZ, tileY, nowMs);
  };

  const prune = (nowMs: number): void => {
    for (const [key, deathAtMs] of firedAt) {
      if (nowMs > deathAtMs + SIEGE_KILL_FIRE_WINDOW_MS) firedAt.delete(key);
    }
  };

  const clear = (): void => firedAt.clear();

  return { fire, prune, clear };
};
