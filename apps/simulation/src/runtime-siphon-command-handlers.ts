import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import {
  SIPHON_COOLDOWN_MS,
  SIPHON_CRYSTAL_COST,
  SIPHON_DURATION_MS,
  SIPHON_SHARE
} from "@border-empires/game-domain";
import { parseTilePayload } from "./runtime-command-parsers.js";
import { isAlliedOrTruced } from "./runtime-player-factory.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { RuntimeAbilityCommandContext } from "./runtime-ability-command-handlers.js";

function rejectCommand(
  context: RuntimeAbilityCommandContext,
  command: CommandEnvelope,
  code: string,
  message: string
): void {
  context.emitEvent({
    eventType: "COMMAND_REJECTED",
    commandId: command.commandId,
    playerId: command.playerId,
    code,
    message
  });
}

function isActiveSiphon(tile: DomainTileState, now: number): boolean {
  return Boolean(tile.sabotage && tile.sabotage.endsAt > now);
}

function siphonableTileForActor(
  tile: DomainTileState | undefined,
  actor: DomainPlayer,
  now: number
): tile is DomainTileState {
  if (!tile || tile.terrain !== "LAND" || !tile.ownerId || tile.ownerId === actor.id || isAlliedOrTruced(actor, tile.ownerId)) {
    return false;
  }
  if (!tile.town && !tile.resource) return false;
  return !isActiveSiphon(tile, now);
}

export function handleSiphonTileCommand(context: RuntimeAbilityCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!actor.techIds.has("logistics")) {
    rejectCommand(context, command, "SIPHON_INVALID", "requires Logistics");
    return;
  }
  const siphonNow = context.now();
  if (!siphonableTileForActor(target, actor, siphonNow)) {
    rejectCommand(context, command, "SIPHON_INVALID", "target enemy-controlled town or resource tile");
    return;
  }
  const siphonObservatoryKey = context.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, siphonNow);
  if (!siphonObservatoryKey) {
    rejectCommand(context, command, "SIPHON_INVALID", "no ready observatory within 30 tiles of target");
    return;
  }
  const affectedTiles: DomainTileState[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const candidate = context.tiles.get(simulationTileKey(target.x + dx, target.y + dy));
      if (siphonableTileForActor(candidate, actor, siphonNow)) affectedTiles.push(candidate);
    }
  }
  if (affectedTiles.length === 0) {
    rejectCommand(context, command, "SIPHON_INVALID", "no eligible town or resource tiles in siphon area");
    return;
  }
  if (!context.spendStrategicResource(actor, "CRYSTAL", SIPHON_CRYSTAL_COST)) {
    rejectCommand(context, command, "SIPHON_INVALID", "insufficient CRYSTAL for siphon");
    return;
  }
  context.stampObservatoryCooldown(siphonObservatoryKey, SIPHON_COOLDOWN_MS, siphonNow, command.commandId, command.playerId);
  const endsAt = siphonNow + SIPHON_DURATION_MS;
  const updatedTiles = affectedTiles.map((tile): DomainTileState => ({
    ...tile,
    sabotage: {
      ownerId: actor.id,
      endsAt,
      outputMultiplier: 1 - SIPHON_SHARE
    }
  }));
  for (const updatedTile of updatedTiles) context.replaceTileState(simulationTileKey(updatedTile.x, updatedTile.y), updatedTile);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: updatedTiles.map((updatedTile) => context.tileDeltaFromState(updatedTile))
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}
