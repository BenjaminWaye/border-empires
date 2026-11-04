import type { DomainTileState } from "@border-empires/game-domain";
import {
  STACKING_SAME_TILE_SUPPORT_STRUCTURE_TYPES,
  STACKING_TOWN_SUPPORT_STRUCTURE_TYPES,
  structurePlacementMetadata,
  type BuildableStructureType,
  type EconomicStructureType
} from "@border-empires/shared";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";
import { rejectCommand, structureLabel } from "./runtime-structure-command-handlers-reject.js";

// User decision: the only structure that belongs directly ON a town tile is
// a Fort — every other support-ring building clicked on the town tile itself
// should auto-place onto an open support tile next to it instead. Most
// support-ring buildings get that via placementMode "town_support" (below).
// The uncapped "same_tile" stackers (STACKING_SAME_TILE_SUPPORT_STRUCTURE_TYPES)
// would be wrongly capped at one copy by that path's "town already has X"
// singleton check, so they keep "same_tile" and get a narrower redirect: only
// when the target IS the town tile, skip straight to an open support tile,
// with no uniqueness gate. The "town_support" stackers
// (STACKING_TOWN_SUPPORT_STRUCTURE_TYPES, the Aether Condensers) skip the
// singleton gate; the town's open support tiles remain their real cap. Both
// lists live in packages/shared/src/structure-stacking/ so the AI planner
// applies the identical rule.

export function resolveTownSupportTarget(
  context: RuntimeStructureCommandContext,
  command: CommandEnvelope,
  target: DomainTileState,
  structureType: BuildableStructureType
): DomainTileState | undefined {
  const placement = structurePlacementMetadata(structureType);
  if (placement.placementMode !== "town_support") {
    if (target.town && STACKING_SAME_TILE_SUPPORT_STRUCTURE_TYPES.has(structureType)) {
      if (target.town.populationTier === "SETTLEMENT") {
        rejectCommand(context, command, "BUILD_INVALID", "settlements cannot support economic structures — grow this town first");
        return undefined;
      }
      const townKey = simulationTileKey(target.x, target.y);
      const supportTarget = context.firstAvailableTownSupportTile(command.playerId, townKey, structureType as EconomicStructureType);
      if (!supportTarget) {
        rejectCommand(context, command, "BUILD_INVALID", `${structureLabel(structureType)} needs an open support tile next to this town`);
        return undefined;
      }
      return supportTarget;
    }
    return target;
  }
  const economicType = structureType as EconomicStructureType;

  if (target.town) {
    if (target.town.populationTier === "SETTLEMENT") {
      rejectCommand(context, command, "BUILD_INVALID", "settlements cannot support economic structures — grow this town first");
      return undefined;
    }
    const townKey = simulationTileKey(target.x, target.y);
    if (!STACKING_TOWN_SUPPORT_STRUCTURE_TYPES.has(structureType) &&
      context.economicStructureForSupportedTown(command.playerId, townKey, economicType)) {
      rejectCommand(context, command, "BUILD_INVALID", `town already has ${structureLabel(structureType)}`);
      return undefined;
    }
    if (economicType === "NEURAL_WORKS" && context.neuralWorksAlreadyInNetwork(command.playerId, townKey)) {
      rejectCommand(context, command, "BUILD_INVALID", "connected town network already has a Neural Works");
      return undefined;
    }
    if (economicType === "RESERVE_LATTICE" && context.reserveLatticeAlreadyInNetwork(command.playerId, townKey)) {
      rejectCommand(context, command, "BUILD_INVALID", "connected town network already has a Reserve Lattice");
      return undefined;
    }
    const supportTarget = context.firstAvailableTownSupportTile(command.playerId, townKey, economicType);
    if (!supportTarget) {
      rejectCommand(context, command, "BUILD_INVALID", `${structureLabel(structureType)} needs an open support tile next to this town`);
      return undefined;
    }
    return supportTarget;
  }

  const supportedTownKey = context.assignedTownKeyForSupportTile(command.playerId, target.x, target.y);
  if (!STACKING_TOWN_SUPPORT_STRUCTURE_TYPES.has(structureType) &&
    supportedTownKey && context.economicStructureForSupportedTown(command.playerId, supportedTownKey, economicType)) {
    rejectCommand(context, command, "BUILD_INVALID", `town already has ${structureLabel(structureType)}`);
    return undefined;
  }
  if (economicType === "NEURAL_WORKS" && supportedTownKey && context.neuralWorksAlreadyInNetwork(command.playerId, supportedTownKey)) {
    rejectCommand(context, command, "BUILD_INVALID", "connected town network already has a Neural Works");
    return undefined;
  }
  if (economicType === "RESERVE_LATTICE" && supportedTownKey && context.reserveLatticeAlreadyInNetwork(command.playerId, supportedTownKey)) {
    rejectCommand(context, command, "BUILD_INVALID", "connected town network already has a Reserve Lattice");
    return undefined;
  }
  return target;
}
