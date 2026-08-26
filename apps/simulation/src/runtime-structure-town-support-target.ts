import type { DomainTileState } from "@border-empires/game-domain";
import { structurePlacementMetadata, type BuildableStructureType, type EconomicStructureType } from "@border-empires/shared";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";
import { rejectCommand, structureLabel } from "./runtime-structure-command-handlers-reject.js";

// User decision: the only structure that belongs directly ON a town tile is
// a Fort — every other support-ring building clicked on the town tile itself
// should auto-place onto an open support tile next to it instead. That's
// already what placementMode "town_support" does (see resolveTownSupportTarget
// below) for most support-ring buildings, but these four are deliberately
// uncapped/stacking per town (Mintworks: "stacks additively with every other
// active Mintworks"; Garrison Hall/the two Weapons Factories: "same_tile
// placement, can sit anywhere", "no per-town limit") — routing them through
// the same town_support path would wrongly reject a 2nd/3rd copy via its
// "town already has X" singleton check. So they stay placementMode
// "same_tile" (preserving stacking when built directly on a support tile)
// and get their own narrower redirect: only when the target IS the town
// tile, skip straight to an open support tile, with no uniqueness gate.
const STACKING_SUPPORT_STRUCTURE_TILE_REDIRECT_TYPES = new Set<BuildableStructureType>([
  "MINTWORKS",
  "GARRISON_HALL",
  "TITANIUM_WEAPONS_FACTORY",
  "UMBRITE_WEAPONS_FACTORY"
]);

// User decision: unlike the other town_support economics (one of each type
// per town, forcing sprawl across multiple towns for more supply), the
// Aether Condenser stacks — a town can host as many as it has open support
// tiles for. Exempts CRYSTAL_SYNTHESIZER/ADVANCED_CRYSTAL_SYNTHESIZER from
// the "town already has X" singleton gate below; firstAvailableTownSupportTile
// still requires an open ring tile, so the town's support-tile count remains
// the real cap.
const STACKING_TOWN_SUPPORT_STRUCTURE_TYPES = new Set<BuildableStructureType>([
  "CRYSTAL_SYNTHESIZER",
  "ADVANCED_CRYSTAL_SYNTHESIZER"
]);

export function resolveTownSupportTarget(
  context: RuntimeStructureCommandContext,
  command: CommandEnvelope,
  target: DomainTileState,
  structureType: BuildableStructureType
): DomainTileState | undefined {
  const placement = structurePlacementMetadata(structureType);
  if (placement.placementMode !== "town_support") {
    if (target.town && STACKING_SUPPORT_STRUCTURE_TILE_REDIRECT_TYPES.has(structureType)) {
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
    if (economicType === "RAIL_DEPOT" && context.railDepotAlreadyInNetwork(command.playerId, townKey)) {
      rejectCommand(context, command, "BUILD_INVALID", "connected town network already has a Rail Depot");
      return undefined;
    }
    if (economicType === "ASSEMBLY_WORKS" && context.assemblyWorksAlreadyInNetwork(command.playerId, townKey)) {
      rejectCommand(context, command, "BUILD_INVALID", "connected town network already has an Assembly Works");
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
  if (economicType === "RAIL_DEPOT" && supportedTownKey && context.railDepotAlreadyInNetwork(command.playerId, supportedTownKey)) {
    rejectCommand(context, command, "BUILD_INVALID", "connected town network already has a Rail Depot");
    return undefined;
  }
  if (economicType === "ASSEMBLY_WORKS" && supportedTownKey && context.assemblyWorksAlreadyInNetwork(command.playerId, supportedTownKey)) {
    rejectCommand(context, command, "BUILD_INVALID", "connected town network already has an Assembly Works");
    return undefined;
  }
  return target;
}
