import {
  grassShadeAt,
  landBiomeAt,
  structureBuildGoldCost,
  structureBuildManpowerCost
} from "@border-empires/shared";
import { isForestTile } from "../client-constants.js";
import { ownedActiveOrBuildingObservatoryCount } from "../client-tile-action-support/client-tile-action-support.js";
import {
  structureInfoButtonHtml as structureInfoButtonHtmlFromModule,
  structureInfoForKey as structureInfoForKeyFromModule,
  type StructureInfoKey,
  type StructureInfoView
} from "../client-map-display.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

type BuildableStructureId = "FORT" | "OBSERVATORY" | "SIEGE_OUTPOST" | NonNullable<Tile["economicStructure"]>["type"];

export const createClientRuntimeDisplaySupport = (deps: {
  state: ClientState;
  formatCooldownShort: (remainingMs: number) => string;
  prettyToken: (value: string) => string;
}) => {
  const { state, formatCooldownShort, prettyToken } = deps;

  const ownedStructureCount = (structureType: BuildableStructureId): number => {
    let count = 0;
    for (const tile of state.tiles.values()) {
      if (tile.ownerId !== state.me) continue;
      if (structureType === "FORT" && tile.fort) count += 1;
      else if (structureType === "OBSERVATORY" && tile.observatory) count += 1;
      else if (structureType === "SIEGE_OUTPOST" && tile.siegeOutpost) count += 1;
      else if (tile.economicStructure?.type === structureType) count += 1;
    }
    return count;
  };

  const structureGoldCost = (structureType: BuildableStructureId): number =>
    structureBuildGoldCost(structureType, ownedStructureCount(structureType));

  // §5 (resource slots, docs/manpower-economy-rewrite-plan.md): FOOD/TITANIUM/
  // CRYSTAL/UMBRITE build-time stockpile spend was retired server-side (Step
  // 5 item 4 Slice A) -- structureCostDefinition's resourceCost field for
  // these four keys is stale display copy. This is one-time build cost only
  // (gold/manpower/an optional shard-style override) -- the real ongoing
  // resource-slot/gold-day upkeep is a separate, explicitly labeled "Upkeep:"
  // segment sourced from client-structure-upkeep-text.ts's upkeepDescriptorFor,
  // not folded in here unlabeled.
  const structureCostText = (structureType: BuildableStructureId, resourceOverride?: string): string => {
    const goldCost = structureGoldCost(structureType);
    const parts: string[] = [];
    if (goldCost > 0) parts.push(`${goldCost} gold`);
    const manpowerCost = structureBuildManpowerCost(structureType);
    if (manpowerCost > 0) parts.push(`${manpowerCost} manpower`);
    if (resourceOverride) parts.push(resourceOverride);
    return parts.join(" + ");
  };

  // OBSERVATORY/RELAY_BEACON upkeep both move per copy the player already
  // owns (progressive CRYSTAL cost / FOOD-slot waiver, respectively) --
  // upkeepDescriptorFor needs that count for either type, undefined
  // otherwise. OBSERVATORY specifically needs ownedActiveOrBuildingObservatoryCount,
  // not the generic ownedStructureCount("OBSERVATORY") below: that generic
  // counter (used for gold-cost scaling) counts every observatory tile
  // regardless of status, including an inactive one and a Watchtower
  // Engine's own exempt observatory -- reusing it here would overstate the
  // info modal's progressive CRYSTAL count in exactly the cases this fix
  // exists to correct.
  const ownedCountForUpkeep = (type: StructureInfoKey): number | undefined => {
    if (type === "OBSERVATORY") return ownedActiveOrBuildingObservatoryCount(state);
    if (type === "RELAY_BEACON") return ownedStructureCount(type);
    return undefined;
  };

  const structureInfoForKey = (type: StructureInfoKey): StructureInfoView =>
    structureInfoForKeyFromModule(type, { formatCooldownShort, prettyToken, ownedCountOfType: ownedCountForUpkeep(type) });

  const structureInfoButtonHtml = (type: StructureInfoKey, label?: string): string =>
    structureInfoButtonHtmlFromModule(type, { formatCooldownShort, prettyToken, ownedCountOfType: ownedCountForUpkeep(type) }, label);

  const terrainLabel = (x: number, y: number, terrain: Tile["terrain"]): string => {
    if (terrain !== "LAND") return terrain;
    const visibleTile = state.tiles.get(`${x},${y}`);
    const biome = visibleTile?.terrain === "LAND" ? (visibleTile.landBiome ?? landBiomeAt(x, y)) : landBiomeAt(x, y);
    if (biome === "SAND" || biome === "COASTAL_SAND") return "SAND";
    if (biome === "TUNDRA") return grassShadeAt(x, y) === "DARK" ? "TUNDRA FOREST" : "TUNDRA";
    return isForestTile(x, y) ? "FOREST" : "GRASS";
  };

  return {
    structureGoldCost,
    structureCostText,
    structureInfoForKey,
    structureInfoButtonHtml,
    terrainLabel
  };
};
