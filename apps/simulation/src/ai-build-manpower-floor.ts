import { SETTLE_MANPOWER_COST, STRUCTURE_REGISTRY } from "@border-empires/shared";

/**
 * Manpower an AI player is guaranteed to be able to spend on structure builds,
 * enforced from both sides so neither can silently defeat the other:
 *
 *  - the muster tick never lets an AI flag draw the pool below it
 *    (musterPoolFloorFor), and
 *  - the planner lets structure builds spend pool manpower up to it even while
 *    the war reserve is unmet (spendableBuildManpowerForPlanner).
 *
 * Why both: a flag with headroom that keeps firing refills from every point of
 * regen and pins the pool near zero forever. Confirmed on staging (2026-09-25,
 * via the sim_ai_player_muster_* gauges): ai-2 sat at 0.2 manpower with 88 of
 * flag headroom and 0.85/min regen, so its reach-unlocking Relay Beacon could
 * never be afforded. The flag fires as soon as it holds a target's cost (small
 * for FRONTIER targets — ai-2's staged amount hovered at ~17), so it never
 * accumulates the 120 war reserve either; a floor the planner may not spend
 * would be inert.
 *
 * Value = one full beacon route (frontier-site SETTLE + the beacon's own
 * manpower), read from the shared constants so a re-tuned cost can't leave
 * this stale. AI players only — humans place and manage their own flags.
 */
export const AI_BUILD_MANPOWER_FLOOR: number =
  SETTLE_MANPOWER_COST + (STRUCTURE_REGISTRY["RELAY_BEACON"]?.cost.manpower ?? 0);

/** Pool manpower an AI's muster flags may not draw (0 for humans). */
export const musterPoolFloorFor = (player: { isAi?: boolean | undefined }): number =>
  player.isAi === true ? AI_BUILD_MANPOWER_FLOOR : 0;
