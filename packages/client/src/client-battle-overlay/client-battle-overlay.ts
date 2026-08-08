import { APPROACH_MS, CLASH_MS, ROUT_MS } from "../client-map-3d-battle-overlay-fx.js";
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
};

/** Parses a tile delta's raw `combatJson` field (if present) and, when valid,
 * registers/refreshes an entry in state.activeBattles keyed by the target
 * tile — the single entry point every viewer (attacker, defender, and any
 * bystander with fog-of-war vision on the tile) uses to pick up the battle
 * overlay FX. Purely additive: never touches state.capture or the frontier
 * action-queue HUD. */
export const registerActiveBattleFromTileDelta = (
  state: Pick<ClientState, "activeBattles">,
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
  const clashAt = nowMs + APPROACH_MS;
  state.activeBattles.set(keyFor(update.x, update.y), {
    originX: parsed.originX,
    originY: parsed.originY,
    targetX: update.x,
    targetY: update.y,
    attackerOwnerId: parsed.attackerOwnerId,
    defenderOwnerId: parsed.defenderOwnerId,
    attackerWon: parsed.attackerWon,
    startAt: nowMs,
    clashAt,
    endAt: clashAt + CLASH_MS + ROUT_MS
  });
};

export const pruneExpiredActiveBattles = (state: Pick<ClientState, "activeBattles">, nowMs: number): void => {
  for (const [key, battle] of state.activeBattles) {
    if (nowMs >= battle.endAt) state.activeBattles.delete(key);
  }
};
