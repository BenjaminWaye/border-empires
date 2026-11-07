import { AFC_REPLACEMENT_DELIVERY_MS, afcReplacementCost, isCaptureHoldActive, isAfcFootprintClear } from "@border-empires/shared";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { RuntimeStructureCommandContext } from "../runtime-structure-command-handlers.js";
import { isEmptyAfcSite } from "./afc-owned-site.js";
import { landBuiltAfc } from "../runtime-build-afc-command-handler.js";

/** Replacements reserve a 3x3 footprint; neighbouring AFC centres must be >=3 tiles apart. */
export function isClearAfcFootprint(tiles: ReadonlyMap<string, DomainTileState>, x: number, y: number): boolean {
  return isAfcFootprintClear((tx, ty) => tiles.get(`${tx},${ty}`), x, y);
}

export type AfcRecoverySiteContext = Pick<RuntimeStructureCommandContext, "tiles" | "now" | "locksByTile">;

export function validReplacementSite(context: AfcRecoverySiteContext, playerId: string, x: number, y: number): boolean {
  const tile = context.tiles.get(`${x},${y}`);
  return Boolean(tile && tile.ownerId === playerId && tile.terrain === "LAND" &&
    (tile.ownershipState === "SETTLED" || tile.ownershipState === "FRONTIER") &&
    !isCaptureHoldActive(tile, context.now()) && !context.locksByTile.has(`${x},${y}`) &&
    isEmptyAfcSite(tile) && isClearAfcFootprint(context.tiles, x, y));
}

export function emitRecoveryState(context: Pick<RuntimeStructureCommandContext, "emitEvent" | "emitPlayerStateUpdate">, player: DomainPlayer, commandId: string, refreshPlayerState = true): void {
  context.emitEvent({ eventType: "DOMAIN_UPDATE", playerId: player.id, commandId,
    payloadJson: JSON.stringify({ afcRecoveryOnly: true, afcRecovery: player.afcRecovery, gold: player.points }) });
  if (refreshPlayerState) context.emitPlayerStateUpdate({ playerId: player.id, commandId });
}

export function orderAfcReplacement(context: RuntimeStructureCommandContext, actor: DomainPlayer, command: CommandEnvelope, x: number, y: number): string | undefined {
  if (actor.afcRecovery?.pending) return "An AFC delivery is already in progress";
  if (!validReplacementSite(context, actor.id, x, y)) return "Choose an empty owned landing site with a clear AFC footprint";
  const globalLosses = context.afcGlobalLosses?.() ?? actor.afcRecovery?.globalLosses ?? 0;
  const cost = afcReplacementCost(globalLosses);
  if (actor.points < cost) return `Replacement AFC needs ${cost} gold. Continue fighting or withdraw and redeploy.`;
  context.applyManpowerRegen(actor);
  actor.points -= cost;
  actor.afcRecovery = { globalLosses, requiredSince: actor.afcRecovery?.requiredSince ?? context.now(),
    pending: { x, y, cost, arrivesAt: context.now() + AFC_REPLACEMENT_DELIVERY_MS, commandId: command.commandId } };
  emitRecoveryState(context, actor, `system-runtime:afc-order:${command.commandId}`);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", playerId: actor.id, commandId: command.commandId });
  return undefined;
}

export function cancelAfcReplacement(context: Pick<RuntimeStructureCommandContext, "emitEvent" | "emitPlayerStateUpdate" | "now">, player: DomainPlayer, message: string, securedAfc = false): void {
  const state = player.afcRecovery;
  const pending = state?.pending;
  if (!state || !pending) return;
  player.points += pending.cost;
  delete state.pending;
  if (securedAfc) delete state.requiredSince;
  else state.requiredSince = Math.max(context.now(), (state.requiredSince ?? 0) + 1);
  state.cancellation = message;
  emitRecoveryState(context, player, `system-runtime:afc-delivery:${pending.commandId}`);
}

/** Runs over players, never the world. At most one durable delivery per player. */
export function tickAfcDeliveries(context: RuntimeStructureCommandContext, nowMs: number): void {
  for (const player of context.players.values()) {
    const state = player.afcRecovery;
    const pending = state?.pending;
    if (!state) continue;
    const hasAfc = (context.summaryForPlayer?.(player.id).controlledAfcCount ?? 0) > 0;
    if (!pending) {
      if (hasAfc && state.requiredSince !== undefined) {
        delete state.requiredSince;
        delete state.cancellation;
        emitRecoveryState(context, player, `system-runtime:afc-secured:${player.id}:${nowMs}`);
      }
      continue;
    }
    const invalid = hasAfc ? "Another AFC secured. Replacement delivery refunded." : !validReplacementSite(context, player.id, pending.x, pending.y) ? "Landing site lost or obstructed. Choose another site or withdraw and redeploy." : undefined;
    if (invalid) {
      cancelAfcReplacement(context, player, invalid, hasAfc);
      continue;
    }
    if (nowMs < pending.arrivesAt) continue;
    const tile = context.tiles.get(`${pending.x},${pending.y}`);
    if (!tile) continue;
    delete state.pending;
    delete state.requiredSince;
    delete state.cancellation;
    landBuiltAfc(context, player, tile, `system-runtime:afc-delivery:${pending.commandId}`, true);
    emitRecoveryState(context, player, `system-runtime:afc-delivery:${pending.commandId}`);
  }
}
