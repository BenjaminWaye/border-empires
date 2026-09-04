import { APPROACH_MS, CLASH_MS, ROUT_MS } from "../client-map-3d-popup-marine/popup-marine-timeline.js";
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
  // A pre-resolution skirmish (see client-map-3d-capture-overlays.ts, which
  // stamps state.skirmishSeenAt the first time this client renders it — for
  // the defender via ATTACK_ALERT/incomingAttacksByTile, for the attacker via
  // their own in-flight `capture`) is almost always already visible by the
  // time we get here. Continue its own approach/clash trajectory exactly —
  // same startAt, so the approach-phase interpolation in
  // client-map-3d-popup-marine/popup-marine-overlay-fx.ts picks up mid-stride instead of either
  // restarting a fresh approach (snapping already-clashing dots back out to
  // the tile edge) or forcing an immediate clash while the skirmish's own
  // approach animation was still in flight (snapping mid-approach dots
  // straight to full formation).
  const seenAt = state.skirmishSeenAt.get(key);
  const startAt = seenAt ?? nowMs;
  const clashAt = seenAt === undefined ? nowMs + APPROACH_MS : Math.max(nowMs, seenAt + APPROACH_MS);
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
    fromSkirmish: seenAt !== undefined,
  });
};

export const pruneExpiredActiveBattles = (state: Pick<ClientState, "activeBattles">, nowMs: number): void => {
  for (const [key, battle] of state.activeBattles) {
    if (nowMs >= battle.endAt) state.activeBattles.delete(key);
  }
};
