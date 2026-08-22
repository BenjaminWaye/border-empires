import {
  grassShadeAt,
  landBiomeAt,
  RELAY_BEACON_FREE_FOOD_SLOT_COUNT,
  structureBuildGoldCost,
  structureBuildManpowerCost,
  structureSlotRequirements,
  SYNTHESIZER_STRUCTURE_TYPES,
  type BuildableStructureType
} from "@border-empires/shared";
import { isForestTile } from "../client-constants.js";
import {
  structureInfoButtonHtml as structureInfoButtonHtmlFromModule,
  structureInfoForKey as structureInfoForKeyFromModule,
  type StructureInfoKey,
  type StructureInfoView
} from "../client-map-display.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { ownedRelayBeaconCount } from "../client-relay-beacon-food-slot/client-relay-beacon-food-slot.js";

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
  // these four keys is stale display copy. structureSlotRequirements is the
  // real cost now; synthesizers are exempt (they provide a slot, never
  // consume one, §6.4) so they show no resource line at all, matching the
  // server-side hasFreeResourceSlots skip.
  const structureCostText = (structureType: BuildableStructureId, resourceOverride?: string): string => {
    const goldCost = structureGoldCost(structureType);
    const parts: string[] = [];
    if (goldCost > 0) parts.push(`${goldCost} gold`);
    const manpowerCost = structureBuildManpowerCost(structureType);
    if (manpowerCost > 0) parts.push(`${manpowerCost} manpower`);
    if (resourceOverride) {
      parts.push(resourceOverride);
    } else if (structureType === "RELAY_BEACON" && ownedRelayBeaconCount(state) < RELAY_BEACON_FREE_FOOD_SLOT_COUNT) {
      // The player's first RELAY_BEACON_FREE_FOOD_SLOT_COUNT outposts are
      // waived server-side (slot-waivers.ts) — omit the FOOD slot line
      // entirely rather than showing a cost that won't actually be charged.
    } else if (!SYNTHESIZER_STRUCTURE_TYPES.includes(structureType as BuildableStructureType)) {
      for (const requirement of structureSlotRequirements(structureType)) {
        parts.push(`${requirement.count} ${requirement.resource} slot${requirement.count === 1 ? "" : "s"}`);
      }
    }
    return parts.join(" + ");
  };

  const structureInfoForKey = (type: StructureInfoKey): StructureInfoView =>
    structureInfoForKeyFromModule(type, { formatCooldownShort, prettyToken });

  const structureInfoButtonHtml = (type: StructureInfoKey, label?: string): string =>
    structureInfoButtonHtmlFromModule(type, { formatCooldownShort, prettyToken }, label);

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
