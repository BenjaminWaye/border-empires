import { STARTING_GOLD, STARTING_CAPITAL_MANPOWER_CAP } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { RuntimeRespawnContext } from "../runtime-respawn-helpers.js";
import { respawnIfEliminated } from "../runtime-respawn-helpers.js";
import { abandonedStructureFields } from "../capture-structures/capture-structures.js";
import { emitRecoveryState } from "./afc-recovery.js";

/** An explicit withdrawal forfeits territory, treasury and fielded manpower. House knowledge survives. */
export function withdrawAndRedeploy(context: RuntimeRespawnContext, command: CommandEnvelope): void {
  const effectId = `system-runtime:afc-withdraw:${command.commandId}`;
  const actor = context.players.get(command.playerId);
  const summary = context.summaryForPlayer(command.playerId);
  const reject = (message: string): void => context.emitEvent({ eventType: "COMMAND_REJECTED", playerId: command.playerId, commandId: command.commandId, code: "WITHDRAW_INVALID", message });
  if (!actor || summary.controlledAfcCount > 0) return reject("Withdrawal requires losing your last AFC");
  if ([...summary.territoryTileKeys].some(key => context.locksByTile.has(key) || context.pendingSettlementsByTile.has(key))) return reject("Finish combat and cancel pending garrisons before withdrawing");
  const deltas = [];
  for (const key of [...summary.territoryTileKeys]) {
    const tile = context.tiles.get(key);
    if (!tile || tile.ownerId !== actor.id) continue;
    const released = { ...tile, ownerId: undefined, ownershipState: undefined,
      frontierDecayAt: undefined, frontierDecayKind: undefined, captureHoldUntil: undefined,
      ...abandonedStructureFields(tile), muster: undefined };
    context.replaceTileState(key, released, effectId);
    deltas.push(context.tileDeltaFromState(released));
  }
  summary.waypointQueue.length = 0;
  summary.devQueue.length = 0;
  summary.claimContinuations.clear();
  actor.points = STARTING_GOLD;
  actor.manpower = STARTING_CAPITAL_MANPOWER_CAP;
  actor.manpowerBanked = 0;
  actor.waystationManpowerOverflow = 0;
  actor.afcRecovery = { globalLosses: actor.afcRecovery?.globalLosses ?? 0 };
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: effectId, playerId: actor.id, tileDeltas: deltas });
  respawnIfEliminated(context, actor.id, effectId);
  if (context.summaryForPlayer(actor.id).ownedAfcTileKeys.size === 0) {
    actor.afcRecovery.requiredSince = context.now();
    actor.afcRecovery.cancellation = "Redeployment is waiting for a clear landing site. Try withdrawing and redeploying again.";
  }
  emitRecoveryState(context, actor, effectId);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: actor.id });
}
