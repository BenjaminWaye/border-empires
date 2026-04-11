import { landBiomeAt, structureBuildGoldCost, structureCostDefinition } from "@border-empires/shared";
import { isForestTile } from "./client-constants.js";
import {
  structureInfoButtonHtml as structureInfoButtonHtmlFromModule,
  structureInfoForKey as structureInfoForKeyFromModule,
  type StructureInfoKey,
  type StructureInfoView
} from "./client-map-display.js";
import type { ClientState } from "./client-state.js";
import type { Tile } from "./client-types.js";

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

  const structureCostText = (structureType: BuildableStructureId, resourceOverride?: string): string => {
    const def = structureCostDefinition(structureType);
    const goldCost = structureGoldCost(structureType);
    if (resourceOverride) return `${goldCost} gold + ${resourceOverride}`;
    if (def.resourceCost) return `${goldCost} gold + ${def.resourceCost.amount} ${def.resourceCost.resource}`;
    return `${goldCost} gold`;
  };

  const structureInfoForKey = (type: StructureInfoKey): StructureInfoView =>
    structureInfoForKeyFromModule(type, { formatCooldownShort, prettyToken });

  const structureInfoButtonHtml = (type: StructureInfoKey, label?: string): string =>
    structureInfoButtonHtmlFromModule(type, { formatCooldownShort, prettyToken }, label);

  const terrainLabel = (x: number, y: number, terrain: Tile["terrain"]): string => {
    if (terrain !== "LAND") return terrain;
    const biome = landBiomeAt(x, y);
    if (biome === "GRASS") return isForestTile(x, y) ? "FOREST" : "GRASS";
    return "SAND";
  };

  return {
    structureGoldCost,
    structureCostText,
    structureInfoForKey,
    structureInfoButtonHtml,
    terrainLabel
  };
};
