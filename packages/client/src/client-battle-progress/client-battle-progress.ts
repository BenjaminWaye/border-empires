// Tile-menu progress cards for an in-progress attack -- split out of
// client-action-flow.ts (already over the repo's 500-line growth cap) so
// that file doesn't grow further. captureAttackProgressView covers the
// attacker's own outgoing attack (state.capture); incomingAttackProgressView
// covers a tile the viewer owns that's currently under attack.
import { trackedBattleProgressView } from "./client-tracked-battle-progress.js";
import { EXPAND_MANPOWER_COST, rushBuyPriceGold } from "@border-empires/shared";
import { fallbackOwnerColor, resolveOwnerColor } from "../client-owner-colors/client-owner-colors.js";
import { playerDisplayNameForOwnerFromState } from "../client-owner-name/client-owner-name.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileMenuProgressView } from "../client-types.js";
import { incomingAttackCombatStartAt } from "../client-incoming-frontier-claim/client-incoming-frontier-claim.js";

export const captureAttackProgressView = (
  state: ClientState,
  tile: Tile,
  formatCountdownClock: (ms: number) => string
): TileMenuProgressView | undefined => {
  if (!state.capture || state.capture.target.x !== tile.x || state.capture.target.y !== tile.y) return trackedBattleProgressView(state, tile, formatCountdownClock);
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

// No versus bar for the defender: the server doesn't reveal the attack's odds
// to the defender before it resolves, and a placeholder 50/50 bar read as
// real odds. What the card does state is what's knowable: whether the enemy
// company is still marching here, and that FRONTIER ground has no defending
// force (runtime-lock-resolution.ts's hasDefendingForce -- a guaranteed
// capture with no roll, unless Aegis Lock repels it).
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
        detail: `${marchingDetail}${name} is attacking this tile. The defender can't see the odds until it resolves.`,
        remainingLabel: formatCountdownClock(remainingMs),
        progress,
        note: "Combat resolves in a single roll when the timer ends."
      };
};
