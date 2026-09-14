import { APPROACH_MS, CLASH_MS, ROUT_MS } from "../client-map-3d-popup-marine/popup-marine-overlay-fx.js";
import type { ClientState } from "../client-state/client-state.js";

// Wire shape of a TILE_DELTA_BATCH tile delta's `combatJson` field (mirrors
// CombatBroadcastPayload in @border-empires/sim-protocol — duplicated here
// rather than imported since the client package doesn't depend on
// sim-protocol; it only ever sees this over the wire as untyped JSON).
type CombatBroadcastPayload = {
  attackerOwnerId: string;
  defenderOwnerId: string;
  attackerWon: boolean;
  originX: number;
  originY: number;
  at: number;
};

const isCombatBroadcastPayload = (value: unknown): value is CombatBroadcastPayload =>
  Boolean(value) &&
  typeof value === "object" &&
  typeof (value as CombatBroadcastPayload).attackerOwnerId === "string" &&
  typeof (value as CombatBroadcastPayload).defenderOwnerId === "string" &&
  typeof (value as CombatBroadcastPayload).attackerWon === "boolean" &&
  typeof (value as CombatBroadcastPayload).originX === "number" &&
  typeof (value as CombatBroadcastPayload).originY === "number";

export type ActiveBattleOverlay = {
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  attackerOwnerId: string;
  defenderOwnerId: string;
  attackerWon: boolean;
  startAt: number;
  clashAt: number;
  endAt: number;
  fromSkirmish: boolean;
};

/** Parses a tile delta's raw `combatJson` field (if present) and, when valid,
 * registers/refreshes an entry in state.activeBattles keyed by the target
 * tile — the single entry point every viewer (attacker, defender, and any
 * bystander with fog-of-war vision on the tile) uses to pick up the battle
 * overlay FX. Purely additive: never touches state.capture or the frontier
 * action-queue HUD. */
export const registerActiveBattleFromTileDelta = (
  state: Pick<ClientState, "activeBattles" | "skirmishSeenAt">,
  keyFor: (x: number, y: number) => string,
  update: { x: number; y: number; combatJson?: string },
  nowMs: number
): void => {
  if (!update.combatJson) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(update.combatJson);
  } catch {
    return;
  }
  if (!isCombatBroadcastPayload(parsed)) return;
  const key = keyFor(update.x, update.y);
  // The resolved battle always starts already standing at the firing line —
  // it never replays the run-in-from-the-tile-edge approach. By the time a
  // resolution broadcast lands, the pre-resolution skirmish (see
  // client-map-3d-capture-overlays.ts) has, in every real case, already run
  // that approach; repeating it here read as the fight restarting from
  // scratch. Pinning startAt this far in the past makes computeBattlePose
  // (popup-marine-timeline.ts) skip straight past its LINEUP_MS/MARCH_MS
  // phases into the firefight, landing each marine at exactly the
  // firingX/firingZ slot it was already standing at — that position is a
  // pure function of the tile's hashSeed, not of elapsed time, so it's
  // identical to wherever the skirmish left this same marine.
  //
  // This used to instead try to inherit the skirmish's own startAt/timing
  // (via state.skirmishSeenAt) so the approach-phase interpolation picked
  // up "mid-stride". That chased two problems that no longer matter here:
  // an attacker's own client learns of resolution via two independent WS
  // messages with no ordering guarantee (COMBAT_RESULT can clear
  // state.capture before the TILE_DELTA_BATCH carrying combatJson arrives,
  // dropping the inherited timestamp), and a defender's skirmish can hold
  // its approach open past the default APPROACH_MS. Skipping the approach
  // outright sidesteps both — there's no timing to inherit or race over.
  const seenAt = state.skirmishSeenAt.get(key);
  const startAt = nowMs - APPROACH_MS;
  const clashAt = nowMs;
  state.activeBattles.set(key, {
    originX: parsed.originX,
    originY: parsed.originY,
    targetX: update.x,
    targetY: update.y,
    attackerOwnerId: parsed.attackerOwnerId,
    defenderOwnerId: parsed.defenderOwnerId,
    attackerWon: parsed.attackerWon,
    startAt,
    clashAt,
    endAt: clashAt + CLASH_MS + ROUT_MS,
    // Purely informational now (see computeBattlePose's preDead handling) —
    // no longer load-bearing for positioning, so a missed seenAt (e.g. the
    // COMBAT_RESULT/TILE_DELTA_BATCH race above) only means a marine that
    // already fell during the skirmish's own firefight loop briefly
    // re-plays its death animation instead of starting collapsed, not a
    // full restart.
    fromSkirmish: seenAt !== undefined,
  });
};

export const pruneExpiredActiveBattles = (state: Pick<ClientState, "activeBattles">, nowMs: number): void => {
  for (const [key, battle] of state.activeBattles) {
    if (nowMs >= battle.endAt) state.activeBattles.delete(key);
  }
};
