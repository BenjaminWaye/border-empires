import type { DomainTileState } from "@border-empires/game-domain";
import { CONVERTER_MODE_FLIP_COOLDOWN_MS, MARKET_INSTANT_GOLD_BONUS } from "@border-empires/game-domain";
import { GRANARY_INSTANT_POPULATION_BURST, SYNTHESIZER_STRUCTURE_TYPES, STRUCTURE_REGISTRY, type BuildableStructureType } from "@border-empires/shared";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";
import { isMonumentBaseType, monumentClaimOwnerId } from "./monument-uniqueness.js";
import { garrisonCapForVariant, initialGarrisonForVariant } from "./runtime-fort-garrison-tick.js";
import { announceMonumentClaim, resolveLostMonumentAssemblyRace } from "./runtime-monument-claim.js";

// Extracted out of runtime-structure-command-handlers.ts so that file stays
// net-smaller (500-line budget, AGENTS.md). Build-completion helpers and the
// completion handler itself: the converter mode-lock fields (plan decision 4
// — the cooldown starts on build too, so "build in cheap mode, flip
// immediately" is not a cheaper path to the expensive mode), the Granary
// instant population burst, and completeStructureBuild.
export const converterBuildModeLockFields = (
  spec: { tileField: string },
  structureType: string,
  now: () => number
): { modeLockedUntil?: number } => {
  if (spec.tileField !== "economicStructure") return {};
  if (!SYNTHESIZER_STRUCTURE_TYPES.includes(structureType as BuildableStructureType)) return {};
  return { modeLockedUntil: now() + CONVERTER_MODE_FLIP_COOLDOWN_MS };
};

export function grantGranaryPopulationBurst(
  context: RuntimeStructureCommandContext,
  ownerId: string,
  x: number,
  y: number,
  commandId: string
): void {
  const townKey = context.assignedTownKeyForSupportTile(ownerId, x, y);
  if (!townKey) return;
  const townTile = context.tiles.get(townKey);
  if (!townTile?.town || townTile.ownerId !== ownerId) return;
  const updatedTownTile: DomainTileState = {
    ...townTile,
    town: {
      ...townTile.town,
      population: (townTile.town.population ?? 0) + GRANARY_INSTANT_POPULATION_BURST,
      maxPopulation: (townTile.town.maxPopulation ?? 0) + GRANARY_INSTANT_POPULATION_BURST
    }
  };
  context.replaceTileState(townKey, updatedTownTile, commandId);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId,
    playerId: ownerId,
    tileDeltas: [context.tileDeltaFromState(updatedTownTile)]
  });
}

export function grantMarketInstantGoldBonus(
  context: RuntimeStructureCommandContext,
  ownerId: string,
  commandId: string
): void {
  const owner = context.players.get(ownerId);
  if (!owner) return;
  owner.points += MARKET_INSTANT_GOLD_BONUS;
  context.emitPlayerStateUpdate({ commandId, playerId: ownerId });
}

export function completeStructureBuild(context: RuntimeStructureCommandContext, targetKey: string, ownerId: string, structureType: string, commandId: string): void {
  const spec = STRUCTURE_REGISTRY[structureType];
  if (!spec) return;
  const latest = context.tiles.get(targetKey);
  if (!latest || latest.ownerId !== ownerId) return;
  const structure = latest[spec.tileField];
  if (!structure || structure.ownerId !== ownerId || structure.status !== "under_construction") return;
  if (spec.tileField === "economicStructure" && latest.economicStructure?.type !== structureType) return;

  // §16: two players' assemblies can both be "under_construction" at once (the reject gate only sees an already-ACTIVE one) — the completion race's loser must not also go active.
  if (isMonumentBaseType(structureType)) {
    const claimedBy = monumentClaimOwnerId(context.tiles, structureType);
    if (claimedBy && claimedBy !== ownerId) {
      resolveLostMonumentAssemblyRace(context, targetKey, latest, ownerId, structureType, commandId);
      return;
    }
  }

  const { completesAt: _, ...activeStructure } = structure;
  const activeVariant = "variant" in activeStructure ? activeStructure.variant : undefined;
  const garrisonInit = spec.tileField === "fort"
    ? {
        garrison: initialGarrisonForVariant(activeVariant),
        garrisonCap: garrisonCapForVariant(activeVariant),
        garrisonUpdatedAt: context.now()
      }
    : {};
  const clearingWoodenFort =
    spec.tileField === "fort" &&
    latest.economicStructure?.type === "WOODEN_FORT" &&
    latest.economicStructure?.ownerId === ownerId;

  const completedTile = {
    ...latest,
    ...(clearingWoodenFort ? { economicStructure: undefined } : {}),
    [spec.tileField]: {
      ...activeStructure,
      status: "active",
      activatedAt: context.now(),
      ...garrisonInit,
      ...converterBuildModeLockFields(spec, structureType, context.now)
    }
  } as DomainTileState;

  context.replaceTileState(targetKey, completedTile);
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId: ownerId, tileDeltas: [context.tileDeltaFromState(completedTile)] });
  context.emitPlayerStateUpdate({ commandId, playerId: ownerId });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId, playerId: ownerId });
  // Light Outpost's vision bonus (and, once active, a Siege Outpost's own)
  // is applied by reconcileOutpostVisionBonus via the replaceTileState call
  // above — runtime-outpost-vision.ts.
  if (isMonumentBaseType(structureType)) announceMonumentClaim(context, structureType, ownerId, commandId);
  // Incubation Engine (Granary, tech-tree redesign): instant one-time
  // +10,000 population burst on build completion, applied to both the
  // town's current population AND its cap (a burst that gets silently
  // absorbed into existing headroom wouldn't read as a "burst" at all).
  if (structureType === "GRANARY") {
    grantGranaryPopulationBurst(context, ownerId, completedTile.x, completedTile.y, commandId);
  }
  // Market rebalance (structure-detail-screen task): instant one-time gold
  // grant on completion, on top of its ongoing flat/percentage gold bonuses.
  if (structureType === "MARKET") {
    grantMarketInstantGoldBonus(context, ownerId, commandId);
  }
}
