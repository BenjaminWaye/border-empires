// Tile-menu progress cards for an in-progress attack -- split out of
// client-action-flow.ts (already over the repo's 500-line growth cap) so
// that file doesn't grow further. captureAttackProgressView covers the
// attacker's own outgoing attack (state.capture); incomingAttackProgressView
// covers a tile the viewer owns that's currently under attack.
import { trackedBattleProgressView } from "./client-tracked-battle-progress.js";
import { EXPAND_MANPOWER_COST, rushBuyPriceGold } from "@border-empires/shared";
import { battleOddsDetail, battleOddsView, defenderBattleOddsDetail, defenderBattleOddsView, liveBattleOdds, type LiveWinChance } from "./client-battle-odds.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileMenuProgressView } from "../client-types.js";
import { incomingAttackCombatStartAt } from "../client-incoming-frontier-claim/client-incoming-frontier-claim.js";

export const captureAttackProgressView = (
  state: ClientState,
  tile: Tile,
  formatCountdownClock: (ms: number) => string,
  liveWinChance?: LiveWinChance
): TileMenuProgressView | undefined => {
  if (!state.capture || state.capture.target.x !== tile.x || state.capture.target.y !== tile.y) return trackedBattleProgressView(state, tile, formatCountdownClock, Date.now(), liveWinChance);
  const nowMs = Date.now();
  const remainingMs = Math.max(0, state.capture.resolvesAt - nowMs);
  const totalMs = Math.max(1, state.capture.resolvesAt - state.capture.startAt);
  const progress = Math.max(0, Math.min(1, (nowMs - state.capture.startAt) / totalMs));
  if (state.capture.actionType === "ATTACK") {
    // The dispatch-time snapshot is stable; when none was cached at dispatch
    // (attack launched without opening the tile menu first) fall back to the
    // live attack preview so the card still shows the chance of winning.
    const snapshot = state.capture.combatSnapshot;
    const battle = snapshot
      ? battleOddsView(state, snapshot.defenderOwnerId, snapshot.winChance)
      : liveBattleOdds(state, tile, liveWinChance);
    return {
      title: "Battle in progress",
      detail: battle
        ? battleOddsDetail(battle)
        : "Your forces are attacking this tile. The outcome resolves when the timer ends.",
      remainingLabel: formatCountdownClock(remainingMs),
      progress,
      note: "The fight was already rolled when the attack launched; the result shows when the timer ends.",
      cancelLabel: "Cancel attack",
      cancelActionId: "cancel_capture" as const,
      ...(battle ? { battle } : {})
    };
  }
  return {
    title: "Frontier expansion in progress",
    detail: "This tile is being claimed and will become your frontier when the expansion completes.",
    remainingLabel: formatCountdownClock(remainingMs),
    progress,
    note: "This tile will become frontier territory.",
    cancelLabel: "Cancel expansion",
    cancelActionId: "cancel_capture" as const,
    rushBuyLabel: `⏩ 💰${rushBuyPriceGold(remainingMs, totalMs, EXPAND_MANPOWER_COST)}`,
    rushBuyActionId: "rush_buy" as const
  };
};

// The defender sees the same locked odds the attacker does (ATTACK_ALERT
// carries the attacker's winChance -- the outcome itself is never sent). For
// FRONTIER ground there is no defending force (runtime-lock-resolution.ts's
// hasDefendingForce -- a guaranteed capture with no roll, unless Aegis Lock
// repels it), so that card says so instead of showing odds.
export const incomingAttackProgressView = (
  state: ClientState,
  tile: Tile,
  keyFor: (x: number, y: number) => string,
  formatCountdownClock: (ms: number) => string
): TileMenuProgressView | undefined => {
  if (tile.ownerId !== state.me) return undefined;
  const incoming = state.incomingAttacksByTile.get(keyFor(tile.x, tile.y));
  if (!incoming) return undefined;
  const nowMs = Date.now();
  const remainingMs = Math.max(0, incoming.resolvesAt - nowMs);
  const startAt = incomingAttackCombatStartAt(incoming);
  const totalMs = Math.max(1, incoming.resolvesAt - startAt);
  const progress = Math.max(0, Math.min(1, (nowMs - startAt) / totalMs));
  const name = incoming.attackerName;
  const marching = incoming.transitEndsAt !== undefined && incoming.transitEndsAt > nowMs;
  const undefended = tile.ownershipState === "FRONTIER";
  const odds = typeof incoming.winChance === "number" ? defenderBattleOddsView(state, incoming.attackerId, incoming.attackerName, incoming.winChance) : undefined;
  const marchingDetail = marching
    ? `${name}'s company is marching here and arrives in ${formatCountdownClock(incoming.transitEndsAt! - nowMs)}. `
    : "";
  return undefended
    ? {
        title: marching ? "Attack incoming" : "Being captured",
        detail: `${marchingDetail}Frontier tiles have no defending force, so ${name} takes this tile when the timer ends.`,
        remainingLabel: formatCountdownClock(remainingMs),
        progress,
        note: "Only Aegis Lock can repel an attack on frontier ground."
      }
    : {
        title: marching ? "Attack incoming" : "Under attack",
        detail: odds ? `${marchingDetail}${defenderBattleOddsDetail(odds)}` : `${marchingDetail}${name} is attacking this tile.`,
        remainingLabel: formatCountdownClock(remainingMs),
        progress,
        note: "The fight was already rolled when the attack launched; the result shows when the timer ends.",
        ...(odds ? { battle: odds } : {})
      };
};
