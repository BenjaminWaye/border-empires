/**
 * Planner-side mirror of the runtime's muster funding rule for ATTACK.
 *
 * Every non-barbarian ATTACK is paid from mustered manpower: the runtime
 * (runtime-frontier-command.ts → resolveMusterSource in
 * runtime-muster-source.ts) looks for one of the attacker's own muster flags
 * on the origin tile or within Chebyshev distance 10 (world-wrapped) holding
 * at least the target's required muster, and rejects with
 * INSUFFICIENT_MUSTER otherwise.
 *
 * The planner used to gate ATTACK on the raw manpower pool only
 * (attackReady in automation-strategic-snapshot.ts). On staging season-41
 * that produced ~85,000 INSUFFICIENT_MUSTER rejections in the last 46h of the
 * season (one AI retried a single tile 1,723 times): the attack could never
 * be funded, ATTACK kept winning the utility ranking, and BUILD_BEACON /
 * EXPAND rarely got a turn, so empires stopped growing.
 *
 * The check is optimistic, not exact: it uses the frontier/settled muster
 * floor, ignores reservations, fort multipliers and besieged flags, and treats
 * an in-range flag outside the planner's tile view as funded. So some attacks
 * it passes can still be rejected — the ATTACK rejection cooldown covers that.
 * Attacks it blocks show as utilityGates.attackUnfunded in AI diagnostics.
 * Cost: origin tile plus this player's active flags (MUSTER_MAX_TILES, 2).
 */
import { FRONTIER_ATTACK_MUSTER_COST, MUSTER_ATTACK_COST, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { AutomationPlannerTile } from "./automation-command-planner-types.js";

/** Mirrors resolveMusterSource's search radius (runtime-muster-source.ts). */
export const MUSTER_SOURCE_MAX_DISTANCE = 10;

type MusterTile = Pick<AutomationPlannerTile, "x" | "y" | "muster">;
type AttackTargetState = { ownershipState?: string | undefined };

/** Smallest muster any attack on `target` can need: the frontier floor, or the settled base cost. */
export const minimumMusterForAttackTarget = (target: AttackTargetState): number =>
  target.ownershipState === "SETTLED" ? MUSTER_ATTACK_COST : FRONTIER_ATTACK_MUSTER_COST;

const wrappedChebyshev = (a: { x: number; y: number }, b: { x: number; y: number }): number => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(Math.min(dx, WORLD_WIDTH - dx), Math.min(dy, WORLD_HEIGHT - dy));
};

const flagHolds = (tile: MusterTile | undefined, playerId: string, required: number): boolean =>
  Boolean(tile?.muster && tile.muster.ownerId === playerId && (tile.muster.amount ?? 0) >= required);

export type AttackMusterFundingInput = {
  playerId: string;
  /** Attack origin; its muster is read from tilesByKey (the selection's copy may omit it). */
  from: { x: number; y: number };
  target: AttackTargetState;
  musterTileKeys: ReadonlySet<string> | undefined;
  tilesByKey: ReadonlyMap<string, MusterTile>;
};

/** True when some own muster flag in range could fund the cheapest possible attack on `target`. */
export const attackHasFundedMuster = (input: AttackMusterFundingInput): boolean => {
  const required = minimumMusterForAttackTarget(input.target);
  if (flagHolds(input.tilesByKey.get(`${input.from.x},${input.from.y}`), input.playerId, required)) return true;
  // No flag list synced (direct/test callers): unknown, so don't block.
  if (!input.musterTileKeys) return true;
  for (const key of input.musterTileKeys) {
    const [x, y] = key.split(",").map(Number);
    if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (wrappedChebyshev({ x, y }, input.from) > MUSTER_SOURCE_MAX_DISTANCE) continue;
    const flag = input.tilesByKey.get(key);
    // A flag outside this planner's tile view has an unknown amount: assume
    // it can fund rather than silently disabling every attack it backs.
    if (!flag || flagHolds(flag, input.playerId, required)) return true;
  }
  return false;
};
