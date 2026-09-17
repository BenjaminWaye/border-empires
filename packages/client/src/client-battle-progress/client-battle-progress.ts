// Tile-menu progress cards for an in-progress attack -- split out of
// client-action-flow.ts (already over the repo's 500-line growth cap) so
// that file doesn't grow further. captureAttackProgressView covers the
// attacker's own outgoing attack (state.capture); incomingAttackProgressView
// covers a tile the viewer owns that's currently under attack.
import { EXPAND_MANPOWER_COST, rushBuyPriceGold } from "@border-empires/shared";
import { fallbackOwnerColor, resolveOwnerColor } from "../client-owner-colors/client-owner-colors.js";
import { playerDisplayNameForOwnerFromState } from "../client-owner-name/client-owner-name.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileMenuProgressView } from "../client-types.js";

export const captureAttackProgressView = (
  state: ClientState,
  tile: Tile,
  formatCountdownClock: (ms: number) => string
): TileMenuProgressView | undefined => {
  if (!state.capture || state.capture.target.x !== tile.x || state.capture.target.y !== tile.y) return undefined;
  const nowMs = Date.now();
  const remainingMs = Math.max(0, state.capture.resolvesAt - nowMs);
  const totalMs = Math.max(1, state.capture.resolvesAt - state.capture.startAt);
  const progress = Math.max(0, Math.min(1, (nowMs - state.capture.startAt) / totalMs));
  if (state.capture.actionType === "ATTACK") {
    const snapshot = state.capture.combatSnapshot;
    const battle = snapshot
      ? {
          attackerColor: resolveOwnerColor(state.me, state.playerColors, fallbackOwnerColor),
          defenderColor: resolveOwnerColor(snapshot.defenderOwnerId, state.playerColors, fallbackOwnerColor),
          attackerShare: Math.max(0, Math.min(1, snapshot.winChance)),
          attackerLabel: "You",
          defenderLabel: playerDisplayNameForOwnerFromState(state, snapshot.defenderOwnerId) ?? "Defender"
        }
      : undefined;
    return {
      title: "Battle in progress",
      detail: battle
        ? `Pre-battle odds: ${Math.round(battle.attackerShare * 100)}% you, ${Math.round((1 - battle.attackerShare) * 100)}% ${battle.defenderLabel}.`
        : "Your forces are attacking this tile. The outcome resolves when the timer ends.",
      remainingLabel: formatCountdownClock(remainingMs),
      progress,
      note: "Combat resolves in a single roll when the timer ends — this doesn't shift as it counts down.",
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
  const startAt = incoming.transitEndsAt ?? incoming.resolvesAt - 3_000;
  const totalMs = Math.max(1, incoming.resolvesAt - startAt);
  const defenderColor = resolveOwnerColor(state.me, state.playerColors, fallbackOwnerColor);
  const attackerColor = incoming.attackerId ? resolveOwnerColor(incoming.attackerId, state.playerColors, fallbackOwnerColor) : "#8a8f98";
  return {
    title: "Under attack",
    detail: `${incoming.attackerName} is attacking this tile. Odds aren't visible to the defender until it resolves.`,
    remainingLabel: formatCountdownClock(remainingMs),
    progress: Math.max(0, Math.min(1, (nowMs - startAt) / totalMs)),
    note: "Combat resolves in a single roll when the timer ends.",
    battle: { attackerColor, defenderColor, attackerShare: 0.5, attackerLabel: incoming.attackerName, defenderLabel: "You" }
  };
};
