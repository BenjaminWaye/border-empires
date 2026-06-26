import type { DomainTileState } from "@border-empires/game-domain";
import { MUSTER_MAX_TILES, MUSTER_SYSTEM_ENABLED, structureBuildDurationMs } from "@border-empires/shared";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import {
  parseClearMusterPayload,
  parseSetMusterPayload,
  parseStructureTilePayload
} from "./runtime-command-parsers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";

function rejectCommand(
  context: RuntimeStructureCommandContext,
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

export function cancelActiveOutpostAttackLocks(context: RuntimeStructureCommandContext, playerId: string, originKey: string): string[] {
  const cancelled: string[] = [];
  const lock = context.locksByTile.get(originKey);
  if (!lock || lock.playerId !== playerId || lock.actionType !== "ATTACK") return cancelled;
  context.locksByTile.delete(lock.originKey);
  context.locksByTile.delete(lock.targetKey);
  context.locksByCommandId.delete(lock.commandId);
  cancelled.push(lock.commandId);
  return cancelled;
}

export function handleSetMusterCommand(context: RuntimeStructureCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseSetMusterPayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  if (!MUSTER_SYSTEM_ENABLED) {
    rejectCommand(context, command, "MUSTER_DISABLED", "muster system is not enabled");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!target || target.ownerId !== command.playerId || target.terrain !== "LAND") {
    rejectCommand(context, command, "MUSTER_INVALID", "owned LAND tile required to muster");
    return;
  }
  const isNewMuster = target.muster?.ownerId !== command.playerId;
  if (isNewMuster) {
    const activeMusters = context.musterTilesByOwner.get(command.playerId)?.size ?? 0;
    if (activeMusters >= MUSTER_MAX_TILES) {
      rejectCommand(context, command, "MUSTER_LIMIT", `max ${MUSTER_MAX_TILES} muster tiles per player`);
      return;
    }
  }
  const now = context.now();
  const updatedTile: DomainTileState = {
    ...target,
    muster: {
      ownerId: command.playerId,
      amount: isNewMuster ? 0 : target.muster!.amount,
      mode: payload.mode,
      ...(typeof payload.targetX === "number" ? { targetX: payload.targetX } : {}),
      ...(typeof payload.targetY === "number" ? { targetY: payload.targetY } : {}),
      setAt: isNewMuster ? now : (target.muster!.setAt ?? now),
      updatedAt: now
    }
  };
  context.replaceTileState(targetKey, updatedTile, command.commandId);
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: command.playerId, tileDeltas: [context.tileDeltaFromState(updatedTile)] });
  // Broadcast stripped muster presence to all players so enemies see the flag.
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: `${command.commandId}:bc`,
    playerId: "__broadcast__",
    tileDeltas: [{ x: updatedTile.x, y: updatedTile.y, ownerId: updatedTile.ownerId, ownershipState: updatedTile.ownershipState, musterJson: JSON.stringify({ ownerId: command.playerId, mode: payload.mode, amount: 0, updatedAt: now }) }]
  });
  context.emitPlayerStateUpdate(command);
}

export function handleClearMusterCommand(context: RuntimeStructureCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseClearMusterPayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!target || target.ownerId !== command.playerId || !target.muster) {
    rejectCommand(context, command, "MUSTER_INVALID", "no muster on owned tile");
    return;
  }
  actor.manpower = Math.min(context.playerManpowerCap(actor), actor.manpower + target.muster.amount);
  const updatedTile: DomainTileState = { ...target, muster: undefined };
  context.replaceTileState(targetKey, updatedTile, command.commandId);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [{ ...context.tileDeltaFromState(updatedTile), musterJson: "" }]
  });
  // Broadcast muster clear to all players so enemies see the flag removed.
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: `${command.commandId}:bc`,
    playerId: "__broadcast__",
    tileDeltas: [{ x: updatedTile.x, y: updatedTile.y, ownerId: updatedTile.ownerId, ownershipState: updatedTile.ownershipState, musterJson: "" }]
  });
  context.emitPlayerStateUpdate(command);
}

export function handleCancelFortBuildCommand(context: RuntimeStructureCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseStructureTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!target?.fort || target.fort.ownerId !== command.playerId || target.fort.status !== "under_construction") {
    rejectCommand(context, command, "FORT_CANCEL_INVALID", "no fort under construction on tile");
    return;
  }
  const updatedTile: DomainTileState = { ...target, fort: undefined };
  context.replaceTileState(targetKey, updatedTile);
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: command.playerId, tileDeltas: [context.tileDeltaFromState(updatedTile)] });
}

export function handleCancelStructureBuildCommand(context: RuntimeStructureCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseStructureTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!target) {
    rejectCommand(context, command, "STRUCTURE_CANCEL_INVALID", "no removable structure action on tile");
    return;
  }
  const updatedTile = cancelStructureActionTile(target, command.playerId);
  if (!updatedTile) {
    rejectCommand(context, command, "STRUCTURE_CANCEL_INVALID", "no removable structure action on tile");
    return;
  }
  context.replaceTileState(targetKey, updatedTile);
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: command.playerId, tileDeltas: [context.tileDeltaFromState(updatedTile)] });
}

function cancelStructureActionTile(target: DomainTileState, playerId: string): DomainTileState | undefined {
  if (target.fort?.ownerId === playerId && (target.fort.status === "under_construction" || target.fort.status === "removing")) {
    return {
      ...target,
      fort: target.fort.status === "under_construction"
        ? undefined
        : { ...target.fort, status: target.fort.previousStatus ?? "active", previousStatus: undefined, completesAt: undefined }
    };
  }
  if (target.observatory?.ownerId === playerId && (target.observatory.status === "under_construction" || target.observatory.status === "removing")) {
    return {
      ...target,
      observatory: target.observatory.status === "under_construction"
        ? undefined
        : { ...target.observatory, status: target.observatory.previousStatus ?? "active", previousStatus: undefined, completesAt: undefined }
    };
  }
  if (target.siegeOutpost?.ownerId === playerId && (target.siegeOutpost.status === "under_construction" || target.siegeOutpost.status === "removing")) {
    return {
      ...target,
      siegeOutpost: target.siegeOutpost.status === "under_construction"
        ? undefined
        : { ...target.siegeOutpost, status: target.siegeOutpost.previousStatus ?? "active", previousStatus: undefined, completesAt: undefined }
    };
  }
  if (target.economicStructure?.ownerId === playerId && (target.economicStructure.status === "under_construction" || target.economicStructure.status === "removing")) {
    return {
      ...target,
      economicStructure: target.economicStructure.status === "under_construction"
        ? undefined
        : { ...target.economicStructure, status: target.economicStructure.previousStatus ?? "inactive", previousStatus: undefined, completesAt: undefined }
    };
  }
  return undefined;
}

export function handleRemoveStructureCommand(context: RuntimeStructureCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseStructureTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!target || target.terrain !== "LAND" || target.ownerId !== command.playerId || target.ownershipState !== "SETTLED") {
    rejectCommand(context, command, "STRUCTURE_REMOVE_INVALID", "structure requires settled owned tile");
    return;
  }
  const fort = target.fort?.ownerId === command.playerId ? target.fort : undefined;
  const observatory = target.observatory?.ownerId === command.playerId ? target.observatory : undefined;
  const siegeOutpost = target.siegeOutpost?.ownerId === command.playerId ? target.siegeOutpost : undefined;
  const economicStructure = target.economicStructure?.ownerId === command.playerId ? target.economicStructure : undefined;
  const ownedStructure = fort ?? observatory ?? siegeOutpost ?? economicStructure;
  if (!ownedStructure) {
    rejectCommand(context, command, "STRUCTURE_REMOVE_INVALID", "no owned structure on tile");
    return;
  }
  if (ownedStructure.status === "under_construction") {
    rejectCommand(context, command, "STRUCTURE_REMOVE_INVALID", "cancel construction instead");
    return;
  }
  if (ownedStructure.status === "removing") {
    rejectCommand(context, command, "STRUCTURE_REMOVE_INVALID", "structure is already being removed");
    return;
  }
  if (context.rejectIfNoDevelopmentSlot(command, "STRUCTURE_REMOVE_INVALID", "development slots are busy")) return;

  const now = context.now();
  let removeDurationMs: number;
  let updatedTile: DomainTileState;
  if (fort) {
    removeDurationMs = structureBuildDurationMs("FORT");
    updatedTile = { ...target, fort: { ...fort, status: "removing", previousStatus: "active", completesAt: now + removeDurationMs } };
  } else if (observatory) {
    removeDurationMs = structureBuildDurationMs("OBSERVATORY");
    updatedTile = { ...target, observatory: { ...observatory, status: "removing", previousStatus: observatory.status === "inactive" ? "inactive" : "active", completesAt: now + removeDurationMs } };
  } else if (siegeOutpost) {
    removeDurationMs = structureBuildDurationMs("SIEGE_OUTPOST");
    updatedTile = { ...target, siegeOutpost: { ...siegeOutpost, status: "removing", previousStatus: "active", completesAt: now + removeDurationMs } };
  } else {
    const structure = economicStructure!;
    removeDurationMs = structureBuildDurationMs(structure.type);
    updatedTile = { ...target, economicStructure: { ...structure, status: "removing", previousStatus: structure.status === "inactive" ? "inactive" : "active", completesAt: now + removeDurationMs } };
  }
  context.replaceTileState(targetKey, updatedTile);
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: command.playerId, tileDeltas: [context.tileDeltaFromState(updatedTile)] });
  context.emitPlayerStateUpdate(command);
  context.scheduleAfter(removeDurationMs, () => context.completeStructureRemoval(targetKey, command.playerId, command.commandId));
}

export function completeStructureRemoval(context: RuntimeStructureCommandContext, targetKey: string, ownerId: string, commandId: string): void {
  const latest = context.tiles.get(targetKey);
  if (!latest || latest.ownerId !== ownerId) return;
  let completedTile: DomainTileState | undefined;
  if (latest.fort?.ownerId === ownerId && latest.fort.status === "removing") {
    completedTile = { ...latest, fort: undefined };
  } else if (latest.observatory?.ownerId === ownerId && latest.observatory.status === "removing") {
    completedTile = { ...latest, observatory: undefined };
  } else if (latest.siegeOutpost?.ownerId === ownerId && latest.siegeOutpost.status === "removing") {
    completedTile = { ...latest, siegeOutpost: undefined };
  } else if (latest.economicStructure?.ownerId === ownerId && latest.economicStructure.status === "removing") {
    completedTile = { ...latest, economicStructure: undefined };
  }
  if (!completedTile) return;
  context.replaceTileState(targetKey, completedTile);
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId: ownerId, tileDeltas: [context.tileDeltaFromState(completedTile)] });
  context.emitPlayerStateUpdate({ commandId, playerId: ownerId });
}

export function handleCancelSiegeOutpostBuildCommand(context: RuntimeStructureCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseStructureTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!target?.siegeOutpost || target.siegeOutpost.ownerId !== command.playerId || target.siegeOutpost.status !== "under_construction") {
    rejectCommand(context, command, "SIEGE_OUTPOST_CANCEL_INVALID", "no siege outpost under construction on tile");
    return;
  }
  const updatedTile: DomainTileState = { ...target, siegeOutpost: undefined };
  context.replaceTileState(targetKey, updatedTile);
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: command.playerId, tileDeltas: [context.tileDeltaFromState(updatedTile)] });
  context.emitPlayerStateUpdate(command);
}
