import type { DomainTileState } from "@border-empires/game-domain";
import { CONVERTER_MODE_FLIP_COOLDOWN_MS, ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { abandonedStructureFields } from "./capture-structures/capture-structures.js";
import {
  parseConverterModePayload,
  parseConverterTogglePayload,
  parseStructureTilePayload
} from "./runtime-command-parsers.js";
import { economicStructureGoldUpkeepPerInterval } from "./runtime-structure-rules/runtime-structure-rules.js";
import { SYNTHESIZER_TYPE_SET } from "@border-empires/shared";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { LockRecord, RuntimePlayer, SimulationTileWireDelta, StrategicResourceKey } from "./runtime-types.js";

/** Shared dependencies for the uncapture/converter-toggle command handlers. */
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
  // Abandoning a tile releases the territory, not the buildings on it: a
  // fort, Aether Tower or economic structure stays standing on the now-neutral
  // tile (inert while nobody owns it) and is picked up by whoever claims the
  // tile next, exactly like losing the tile to an attacker. See
  // abandonedStructureFields for what is razed instead of kept.
  const updatedTile: DomainTileState = {
    ...target,
    ownerId: undefined,
    ownershipState: undefined,
    ...abandonedStructureFields(target),
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

export function handleSetConverterStructureEnabledCommand(context: RuntimeEconomicStructureCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseConverterTogglePayload(command.payloadJson);
  if (!actor || !payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  const structure = target?.economicStructure;
  // Tile ownership matters as much as the structure record's ownerId: an
  // abandoned tile keeps its structures (abandonedStructureFields), and those
  // records still name the former owner.
  if (!target || !structure || structure.ownerId !== command.playerId || target.ownerId !== command.playerId) {
    context.rejectCommand(command, "STRUCTURE_TOGGLE_INVALID", "no owned structure on tile"); return;
  }
  if (structure.status === "under_construction" || structure.status === "removing") {
    context.rejectCommand(command, "STRUCTURE_TOGGLE_INVALID", "structure is not ready"); return;
  }
  if (structure.disabledUntil && structure.disabledUntil > context.now()) {
    context.rejectCommand(command, "STRUCTURE_TOGGLE_INVALID", "structure is recovering from overload"); return;
  }

  if (payload.enabled) {
    if (target.ownershipState !== "SETTLED") {
      context.rejectCommand(command, "STRUCTURE_TOGGLE_INVALID", "structure requires settled owned tile"); return;
    }
    const upkeep = economicStructureGoldUpkeepPerInterval(structure.type, structure.converterMode ?? "SYNTHESIZE");
    if (actor.points < upkeep) {
      context.rejectCommand(command, "STRUCTURE_TOGGLE_INVALID", "insufficient gold for structure upkeep"); return;
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

export function handleSetConverterStructureModeCommand(context: RuntimeEconomicStructureCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseConverterModePayload(command.payloadJson);
  if (!actor || !payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  const structure = target?.economicStructure;
  if (!target || !structure || structure.ownerId !== command.playerId) {
    context.rejectCommand(command, "STRUCTURE_MODE_INVALID", "no owned structure on tile"); return;
  }
  if (!SYNTHESIZER_TYPE_SET.has(structure.type)) {
    context.rejectCommand(command, "STRUCTURE_MODE_INVALID", "structure is not a converter"); return;
  }
  if (structure.status === "under_construction" || structure.status === "removing") {
    context.rejectCommand(command, "STRUCTURE_MODE_INVALID", "structure is not ready"); return;
  }
  if (structure.modeLockedUntil && structure.modeLockedUntil > context.now()) {
    const remainingMin = Math.ceil((structure.modeLockedUntil - context.now()) / 60_000);
    context.rejectCommand(command, "STRUCTURE_MODE_LOCKED", `mode locked for another ${remainingMin} min`); return;
  }

  const currentMode = structure.converterMode ?? "SYNTHESIZE";
  if (currentMode === payload.mode) {
    context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
    return;
  }

  // Cap removed per plan Decision 5: no limit on SYNTHESIZE-mode converters per family

  // Flipping *to* SYNTHESIZE starts this converter owing gold upkeep it did
  // not owe in EXCHANGE mode (§Phase 2) — charge the first interval at flip
  // time, same treatment the enable-toggle already gives, rather than
  // silently letting the next upkeep tick shut it down.
  let nextUpkeepAt = structure.nextUpkeepAt;
  if (payload.mode === "SYNTHESIZE") {
    const upkeep = economicStructureGoldUpkeepPerInterval(structure.type, "SYNTHESIZE");
    if (actor.points < upkeep) {
      context.rejectCommand(command, "STRUCTURE_MODE_INVALID", "insufficient gold for structure upkeep"); return;
    }
    actor.points -= upkeep;
    nextUpkeepAt = context.now() + ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS;
  }

  const updatedTile: DomainTileState = {
    ...target,
    economicStructure: {
      ...structure,
      converterMode: payload.mode,
      modeLockedUntil: context.now() + CONVERTER_MODE_FLIP_COOLDOWN_MS,
      nextUpkeepAt
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
