// Refinery field commands (docs/territory-development-plan.md, Phase 2):
// choosing a field when BUILD_ECONOMIC_STRUCTURE builds a refinery, and
// ASSIGN_REFINERY_FIELD to change it. Both validate with the shared rules
// (packages/shared/src/refineries/): the field must match the refinery's
// resource, be linked to the refinery's town by the owner's land within
// reach, and not be held by another of the owner's refineries that could work.
// An explicit field tile the player does not hold is refused with one code
// before any other check (chooseRefineryField), so neither command probes the
// map for hidden deposits.
import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import {
  REFINERY_FIELD_RESOURCE_BY_TYPE, chooseRefineryField, effectiveRefineryField, isRefineryType, takenRefineryFieldIds,
  type RefineryFieldAssignment, type RefineryTile, type RefineryType
} from "@border-empires/shared";
import { parseAssignRefineryFieldPayload } from "../runtime-command-parsers.js";
import type { RuntimeStructureCommandContext } from "../runtime-structure-command-handlers.js";
import { rejectCommand } from "../runtime-structure-command-handlers-reject.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

export type RefineryCommandContext = Pick<
  RuntimeStructureCommandContext,
  "tiles" | "now" | "emitEvent" | "emitPlayerStateUpdate" | "replaceTileState" | "tileDeltaFromState" | "assignedTownKeyForSupportTile" | "summaryForPlayer"
  | "locksByTile"
>;

/** The player's refinery tiles: from their territory when the runtime has it, else a world scan. */
const ownedRefineryTiles = (context: RefineryCommandContext, playerId: string): RefineryTile[] => {
  const keys = context.summaryForPlayer?.(playerId).territoryTileKeys;
  const tiles: Iterable<DomainTileState | undefined> = keys ? [...keys].map((key) => context.tiles.get(key)) : context.tiles.values();
  const result: RefineryTile[] = [];
  for (const tile of tiles) {
    if (tile?.economicStructure?.ownerId === playerId && isRefineryType(tile.economicStructure.type)) result.push(tile);
  }
  return result;
};

const resolveField = (
  context: RefineryCommandContext, command: CommandEnvelope, site: { x: number; y: number }, type: RefineryType,
  requested: { x: number; y: number } | undefined, excludeKey?: string
): (RefineryFieldAssignment & { fieldId: string }) | undefined => {
  const townKey = context.assignedTownKeyForSupportTile(command.playerId, site.x, site.y);
  if (!townKey) {
    rejectCommand(context, command, "REFINERY_NO_TOWN", "a refinery must stand on the support ring of one of your towns");
    return undefined;
  }
  const taken = takenRefineryFieldIds(context.tiles, command.playerId, ownedRefineryTiles(context, command.playerId),
    (ownerId, x, y) => context.assignedTownKeyForSupportTile(ownerId, x, y), excludeKey);
  const choice = chooseRefineryField(context.tiles, command.playerId, type, townKey, taken, requested);
  if (!choice.ok) {
    rejectCommand(context, command, choice.code, choice.message);
    return undefined;
  }
  return { x: choice.x, y: choice.y, assignedAt: context.now(), fieldId: choice.fieldId };
};

/**
 * For a refinery build on its final support tile: the field to store, or
 * null after rejecting the command. Undefined for every other structure.
 */
export const refineryFieldForBuild = (
  context: RefineryCommandContext, command: CommandEnvelope, target: DomainTileState, structureType: string,
  requested: { x: number; y: number } | undefined
): RefineryFieldAssignment | null | undefined => {
  if (!isRefineryType(structureType)) return undefined;
  const resolved = resolveField(context, command, target, structureType, requested);
  if (!resolved) return null;
  const { fieldId: _fieldId, ...assignment } = resolved;
  return assignment;
};

/**
 * ASSIGN_REFINERY_FIELD: owner-only; frozen like BUILD while an attack on the
 * refinery tile is unresolved (attack-development-hold.ts); same validation as
 * the build; restamps assignedAt. Reassigning to the field it already holds is
 * refused (REFINERY_FIELD_UNCHANGED) and changes nothing.
 */
export const handleAssignRefineryFieldCommand = (context: RefineryCommandContext, command: CommandEnvelope): void => {
  const payload = parseAssignRefineryFieldPayload(command.payloadJson);
  if (!payload) return rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
  const key = simulationTileKey(payload.x, payload.y);
  const tile = context.tiles.get(key);
  const record = tile?.economicStructure;
  if (!tile || !record || !isRefineryType(record.type)) return rejectCommand(context, command, "REFINERY_INVALID", "there is no refinery on this tile");
  if (record.ownerId !== command.playerId || tile.ownerId !== command.playerId) return rejectCommand(context, command, "REFINERY_INVALID", "you do not hold this refinery");
  if (record.status === "removing") return rejectCommand(context, command, "REFINERY_INVALID", "this refinery is being removed");
  // After the ownership gate on purpose, as for BUILD: it must not reveal attacks on tiles the caller does not hold.
  if (context.locksByTile.targetLockAt(key)?.actionType === "ATTACK") return rejectCommand(context, command, "REFINERY_INVALID", "tile is under attack");
  const resolved = resolveField(context, command, tile, record.type, { x: payload.fieldX, y: payload.fieldY }, key);
  if (!resolved) return;
  const { fieldId, ...refineryField } = resolved;
  const current = record.refineryField
    ? effectiveRefineryField(context.tiles, command.playerId, record.refineryField, REFINERY_FIELD_RESOURCE_BY_TYPE[record.type])
    : undefined;
  if (current?.field.id === fieldId) return rejectCommand(context, command, "REFINERY_FIELD_UNCHANGED", "this refinery already processes that field");
  const next: DomainTileState = { ...tile, economicStructure: { ...record, refineryField } };
  context.replaceTileState(key, next, command.commandId);
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: command.playerId, tileDeltas: [context.tileDeltaFromState(next)] });
  context.emitPlayerStateUpdate(command);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
};
