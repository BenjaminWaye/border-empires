import type { DomainTileState } from "@border-empires/game-domain";
import {
  CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL,
  FUR_SYNTHESIZER_OVERLOAD_SUPPLY,
  IRONWORKS_OVERLOAD_IRON,
  SYNTH_OVERLOAD_DISABLE_MS,
  SYNTH_OVERLOAD_GOLD_COST
} from "@border-empires/game-domain";
import { ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import {
  parseConverterTogglePayload,
  parseStructureTilePayload
} from "./runtime-command-parsers.js";
import { economicStructureGoldUpkeepPerInterval, isConverterStructureType } from "./runtime-structure-rules/runtime-structure-rules.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { LockRecord, RuntimePlayer, SimulationTileWireDelta, StrategicResourceKey } from "./runtime-types.js";

/** Shared dependencies for the uncapture/overload/converter-toggle command handlers. */
export type RuntimeEconomicStructureCommandContext = {
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  locksByTile: ReadonlyMap<string, LockRecord>;
  now: () => number;
  rejectCommand: (command: Pick<CommandEnvelope, "commandId" | "playerId">, code: string, message: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerStateUpdate: (command: Pick<CommandEnvelope, "commandId" | "playerId">) => void;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  applyEncirclement: (changedKeys: string[], playerId: string, commandId: string, options?: { bfsCap?: number; skipCutOff?: boolean }) => void;
  ownedTileCountForPlayer: (playerId: string) => number;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  playerManpowerCap: (player: RuntimePlayer) => number;
  addStrategicResource: (player: RuntimePlayer, resource: StrategicResourceKey, amount: number) => void;
};

export function handleUncaptureTileCommand(context: RuntimeEconomicStructureCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseStructureTilePayload(command.payloadJson);
  if (!actor || !payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!target) { context.rejectCommand(command, "UNKNOWN_TILE", "tile not found"); return; }
  if (target.ownerId !== command.playerId) { context.rejectCommand(command, "UNCAPTURE_NOT_OWNER", "tile is not owned by you"); return; }
  if (context.ownedTileCountForPlayer(command.playerId) <= 1) { context.rejectCommand(command, "UNCAPTURE_LAST_TILE", "cannot uncapture your last tile"); return; }
  if (target.town?.populationTier === "SETTLEMENT") { context.rejectCommand(command, "UNCAPTURE_SETTLEMENT", "cannot abandon your settlement"); return; }
  const summary = context.summaryForPlayer(command.playerId);
  if (summary.ownedTownTierByTile.size <= 1 && summary.ownedTownTierByTile.has(targetKey)) {
    context.rejectCommand(command, "UNCAPTURE_LAST_TOWN", "cannot abandon your last town"); return;
  }
  if (context.locksByTile.has(targetKey)) { context.rejectCommand(command, "LOCKED", "tile locked in combat"); return; }

  // Refund any banked muster manpower before releasing the tile.
  if (target.muster?.ownerId && target.muster.amount > 0) {
    const musterOwner = context.players.get(target.muster.ownerId);
    if (musterOwner) {
      musterOwner.manpower = Math.min(
        context.playerManpowerCap(musterOwner),
        musterOwner.manpower + target.muster.amount
      );
    }
  }
  const updatedTile: DomainTileState = {
    ...target,
    ownerId: undefined,
    ownershipState: undefined,
    fort: undefined,
    observatory: undefined,
    siegeOutpost: undefined,
    economicStructure: undefined,
    muster: undefined
  };
  context.replaceTileState(targetKey, updatedTile, command.commandId);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
  if (target.muster) {
    context.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: `${command.commandId}:bc`,
      playerId: "__broadcast__",
      tileDeltas: [{ x: updatedTile.x, y: updatedTile.y, musterJson: "" }]
    });
  }
  // Removing an owned tile can sever the supply path to downstream frontier
  // tiles — re-check encirclement connectivity from the now-vacant key.
  context.applyEncirclement([targetKey], command.playerId, command.commandId, { bfsCap: 2000 });
  context.emitPlayerStateUpdate(command);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

export function handleOverloadSynthesizerCommand(context: RuntimeEconomicStructureCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseStructureTilePayload(command.payloadJson);
  if (!actor || !payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  const structure = target?.economicStructure;
  if (!target || !structure || structure.ownerId !== command.playerId) {
    context.rejectCommand(command, "SYNTH_OVERLOAD_INVALID", "no owned synthesizer on tile"); return;
  }
  if (!actor.techIds.has("overload-protocols")) {
    context.rejectCommand(command, "SYNTH_OVERLOAD_INVALID", "unlock synthesizer overload via Overload Protocols first"); return;
  }
  if (
    structure.type !== "FUR_SYNTHESIZER" &&
    structure.type !== "ADVANCED_FUR_SYNTHESIZER" &&
    structure.type !== "IRONWORKS" &&
    structure.type !== "ADVANCED_IRONWORKS" &&
    structure.type !== "CRYSTAL_SYNTHESIZER" &&
    structure.type !== "ADVANCED_CRYSTAL_SYNTHESIZER"
  ) {
    context.rejectCommand(command, "SYNTH_OVERLOAD_INVALID", "only synthesizer structures can overload"); return;
  }
  if (structure.status === "under_construction" || structure.status === "removing") {
    context.rejectCommand(command, "SYNTH_OVERLOAD_INVALID", "synthesizer is not ready"); return;
  }
  if (structure.disabledUntil && structure.disabledUntil > context.now()) {
    context.rejectCommand(command, "SYNTH_OVERLOAD_INVALID", "synthesizer is recovering from overload"); return;
  }
  if (actor.points < SYNTH_OVERLOAD_GOLD_COST) {
    context.rejectCommand(command, "SYNTH_OVERLOAD_INVALID", "insufficient gold for synthesizer overload"); return;
  }

  actor.points -= SYNTH_OVERLOAD_GOLD_COST;
  if (structure.type === "FUR_SYNTHESIZER" || structure.type === "ADVANCED_FUR_SYNTHESIZER") {
    context.addStrategicResource(actor, "SUPPLY", FUR_SYNTHESIZER_OVERLOAD_SUPPLY);
  } else if (structure.type === "IRONWORKS" || structure.type === "ADVANCED_IRONWORKS") {
    context.addStrategicResource(actor, "IRON", IRONWORKS_OVERLOAD_IRON);
  } else {
    context.addStrategicResource(actor, "CRYSTAL", CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL);
  }

  const reenabledAt = context.now() + SYNTH_OVERLOAD_DISABLE_MS;
  const updatedTile: DomainTileState = {
    ...target,
    economicStructure: {
      ...structure,
      status: "inactive",
      disabledUntil: reenabledAt,
      nextUpkeepAt: reenabledAt,
      inactiveReason: undefined
    }
  };
  context.replaceTileState(targetKey, updatedTile);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
  context.emitPlayerStateUpdate(command);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

export function handleSetConverterStructureEnabledCommand(context: RuntimeEconomicStructureCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseConverterTogglePayload(command.payloadJson);
  if (!actor || !payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  const structure = target?.economicStructure;
  if (!target || !structure || structure.ownerId !== command.playerId) {
    context.rejectCommand(command, "CONVERTER_TOGGLE_INVALID", "no owned converter on tile"); return;
  }
  if (!isConverterStructureType(structure.type)) {
    context.rejectCommand(command, "CONVERTER_TOGGLE_INVALID", "only converter structures can be toggled"); return;
  }
  if (structure.status === "under_construction" || structure.status === "removing") {
    context.rejectCommand(command, "CONVERTER_TOGGLE_INVALID", "converter is not ready"); return;
  }
  if (structure.disabledUntil && structure.disabledUntil > context.now()) {
    context.rejectCommand(command, "CONVERTER_TOGGLE_INVALID", "converter is recovering from overload"); return;
  }

  if (payload.enabled) {
    if (target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
      context.rejectCommand(command, "CONVERTER_TOGGLE_INVALID", "converter requires settled owned tile"); return;
    }
    const upkeep = economicStructureGoldUpkeepPerInterval(structure.type);
    if (actor.points < upkeep) {
      context.rejectCommand(command, "CONVERTER_TOGGLE_INVALID", "insufficient gold for converter upkeep"); return;
    }
    actor.points -= upkeep;
  }

  const updatedTile: DomainTileState = {
    ...target,
    economicStructure: {
      ...structure,
      status: payload.enabled ? "active" : "inactive",
      inactiveReason: payload.enabled ? undefined : "manual",
      nextUpkeepAt: context.now() + ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS
    }
  };
  context.replaceTileState(targetKey, updatedTile);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
  context.emitPlayerStateUpdate(command);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}
