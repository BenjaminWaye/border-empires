import { appendPlayerEventLogEntry, type DomainPlayer, type DomainTileState } from "@border-empires/game-domain";
import { displayNameForOwnershipChange } from "../runtime/runtime-ownership-change-sample.js";
import type { RuntimeState } from "../runtime/runtime-state.js";
import type { RuntimeStructureCommandContext } from "../runtime-structure-command-handlers.js";
import { emitRecoveryState, cancelAfcReplacement } from "./afc-recovery.js";

type AfcLossState = Pick<RuntimeState, "afcGlobalLosses" | "players">;
type AfcLossContext = Pick<RuntimeStructureCommandContext, "summaryForPlayer" | "now" | "playerManpowerCap" | "emitEvent" | "emitPlayerStateUpdate">;

/** Keep the tile-write hot path allocation-free for ordinary territory changes. */
export function createAfcTileObserver(stateFor: () => AfcLossState, contextFor: () => AfcLossContext): (previous: DomainTileState | undefined, next: DomainTileState, commandId: string) => void {
  return (previous, next, commandId) => {
    const state = stateFor();
    const owner = previous?.afc?.ownerId;
    const lost = owner && (next.ownerId !== owner || next.afc?.ownerId !== owner);
    const pending = previous?.ownerId ? state.players.get(previous.ownerId)?.afcRecovery?.pending : undefined;
    const siteLost = pending && pending.x === next.x && pending.y === next.y && next.ownerId !== previous?.ownerId;
    const secured = next.ownerId && next.afc?.ownerId === next.ownerId && previous?.afc?.ownerId !== next.afc?.ownerId && state.players.get(next.ownerId)?.afcRecovery?.pending;
    if (lost || siteLost || secured) recordAfcLoss(state, contextFor(), previous, next, commandId);
  };
}

/**
 * The owner's Recent Events line for a lost AFC. Playtesters read an AFC loss as
 * "lost my only town": the AFC is not a town, so the line names it outright.
 */
export const afcLostEventText = (
  owner: string,
  next: Pick<DomainTileState, "x" | "y" | "ownerId">,
  players: ReadonlyMap<string, Pick<DomainPlayer, "name">>,
  wasLast: boolean
): string => {
  const where = `Your AFC (Automated Fabrication Complex) at (${next.x}, ${next.y})`;
  const what = next.ownerId && next.ownerId !== owner ? `${where} was captured by ${displayNameForOwnershipChange(next.ownerId, players)}.` : `${where} was destroyed.`;
  return wasLast ? `${what} It was your last AFC. An AFC is not a town: your towns are held separately. Build a replacement AFC to fabricate structures again.` : what;
};

/** One scalar per campaign. No capture history is retained. */
export function recordAfcLoss(state: AfcLossState, context: AfcLossContext, previous: DomainTileState | undefined, next: DomainTileState, commandId: string): void {
  // A site's owner is the only player who could have reserved it: O(1), no delivery index.
  const previousPlayer = previous?.ownerId ? state.players.get(previous.ownerId) : undefined;
  const pending = previousPlayer?.afcRecovery?.pending;
  if (previousPlayer && pending && pending.x === next.x && pending.y === next.y && next.ownerId !== previousPlayer.id) {
    cancelAfcReplacement(context, previousPlayer, "Landing site lost. Choose another site or withdraw and redeploy.");
  }
  const securedBy = next.ownerId && next.afc?.ownerId === next.ownerId ? state.players.get(next.ownerId) : undefined;
  if (securedBy?.afcRecovery?.pending && previous?.afc?.ownerId !== next.afc?.ownerId) {
    cancelAfcReplacement(context, securedBy, "Another AFC secured. Replacement delivery refunded.", true);
  }
  const owner = previous?.afc?.ownerId;
  if (!owner || (next.ownerId === owner && next.afc?.ownerId === owner)) return;
  state.afcGlobalLosses++;
  const ownerPlayer = owner.startsWith("barbarian-") ? undefined : state.players.get(owner);
  const wasLast = context.summaryForPlayer?.(owner).controlledAfcCount === 0;
  if (ownerPlayer) appendPlayerEventLogEntry(ownerPlayer, { type: "AFC_LOST", text: afcLostEventText(owner, next, state.players, wasLast), occurredAt: context.now(), x: next.x, y: next.y });
  for (const player of state.players.values()) {
    if (player.id.startsWith("barbarian-")) continue;
    const recovery = player.afcRecovery ??= { globalLosses: state.afcGlobalLosses };
    recovery.globalLosses = state.afcGlobalLosses;
    if (player.id === owner && wasLast) {
      recovery.requiredSince = context.now();
      // Losing capacity suspends replenishment; it never deletes existing reserves.
      player.waystationManpowerOverflow = Math.max(player.waystationManpowerOverflow ?? 0, player.manpower - context.playerManpowerCap(player));
      delete recovery.cancellation;
    }
    emitRecoveryState(context, player, `system-runtime:afc-loss:${state.afcGlobalLosses}:${commandId}`, player.id === owner);
  }
}

/** Rollout/restart must preserve reserves of an empire already missing its AFC. */
export function preserveAfclessReserves(players: Iterable<DomainPlayer>, hasOperationalAfc: (playerId: string) => boolean, capFor: (player: DomainPlayer) => number): void {
  for (const player of players) {
    if (player.id.startsWith("barbarian-") || hasOperationalAfc(player.id)) continue;
    player.waystationManpowerOverflow = Math.max(player.waystationManpowerOverflow ?? 0, player.manpower - capFor(player));
  }
}
