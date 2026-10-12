// AETHER_LANCE: purges a hostile settled/frontier tile within observatory range.
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import { AETHER_LANCE_COOLDOWN_MS, playerHasAbilityTech } from "@border-empires/game-domain";
import { parseTilePayload } from "./runtime-command-parsers.js";
import { isAlliedOrTruced } from "./runtime-player-factory.js";
import { attackAlertDisplayName } from "./runtime-frontier-command.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { observatoryCooldownMsForActor, type RuntimeAbilityCommandContext } from "./runtime-ability-command-handlers.js";

export function handleAetherLanceCommand(context: RuntimeAbilityCommandContext, command: CommandEnvelope): void {
  const reject = (code: string, message: string): void =>
    context.emitEvent({ eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId, code, message });
  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) {
    reject("BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!playerHasAbilityTech(actor.techIds, "aether_lance")) {
    reject("AETHER_LANCE_INVALID", "requires Aether Resonance Core");
    return;
  }
  const targetIsPurgeableOwnership = target?.ownershipState === "SETTLED" || target?.ownershipState === "FRONTIER";
  if (
    !target ||
    target.terrain !== "LAND" ||
    !target.ownerId ||
    target.ownerId === actor.id ||
    isAlliedOrTruced(actor, target.ownerId) ||
    !targetIsPurgeableOwnership
  ) {
    reject("AETHER_LANCE_INVALID", "target hostile garrisoned or frontier land");
    return;
  }
  if (context.isTileShieldedByEnemyAegisDome(actor.id, target.x, target.y)) {
    reject("AETHER_LANCE_INVALID", "blocked by an Aegis Dome");
    return;
  }
  if (context.isTileShieldedByEnemyObservatory(actor.id, target.x, target.y)) {
    reject("AETHER_LANCE_INVALID", "blocked by an Aether Tower");
    return;
  }
  const lanceNow = context.now();
  const lanceObservatoryKey = context.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, lanceNow);
  if (!lanceObservatoryKey) {
    reject("AETHER_LANCE_INVALID", "no ready observatory in range");
    return;
  }
  context.stampObservatoryCooldown(
    lanceObservatoryKey,
    observatoryCooldownMsForActor(actor, AETHER_LANCE_COOLDOWN_MS),
    lanceNow,
    command.commandId,
    command.playerId
  );
  const hadMuster = Boolean(target.muster);
  const updatedTile: DomainTileState = {
    ...target,
    ownerId: undefined,
    ownershipState: undefined,
    frontierDecayAt: undefined,
    frontierDecayKind: undefined,
    // Purging ownership destroys any muster flag staged on the tile — the
    // accumulated manpower is lost, not refunded.
    muster: undefined
  };
  context.replaceTileState(targetKey, updatedTile, command.commandId);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
  if (hadMuster) {
    context.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: `${command.commandId}:bc`,
      playerId: "__broadcast__",
      tileDeltas: [{ x: updatedTile.x, y: updatedTile.y, ownerId: updatedTile.ownerId, ownershipState: updatedTile.ownershipState, musterJson: "" }]
    });
  }
  // Purging the tile can strand the defender's other frontier tiles that
  // routed through it back to a settled tile or dock -- same re-check as
  // UNCAPTURE_TILE and combat capture.
  context.applyEncirclement([targetKey], target.ownerId, command.commandId, { bfsCap: 2000 });
  // target.ownerId was checked non-empty and hostile (not the caster, not
  // allied/truced) above, so this always addresses a real defender.
  context.emitEvent({
    eventType: "PLAYER_MESSAGE",
    commandId: command.commandId,
    playerId: target.ownerId,
    messageType: "AETHER_PURGE_ALERT",
    payloadJson: JSON.stringify({
      type: "AETHER_PURGE_ALERT",
      attackerId: actor.id,
      attackerName: attackAlertDisplayName(actor.id, actor.name),
      x: target.x,
      y: target.y
    })
  });
  context.emitPlayerMessage(command, {
    type: "PLAYER_UPDATE",
    points: actor.points,
    strategicResources: actor.strategicResources
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}
