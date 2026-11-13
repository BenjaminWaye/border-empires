import type { DomainTileState } from "@border-empires/game-domain";

// Neural resin, conductive minerals and catalyst were cut
// (docs/territory-development-plan.md, Phase 1). Saves from before the cut
// still hold their deposits and installations; recovery drops both so a
// restored campaign never carries a resource or building the rules no longer
// know.
export const RETIRED_FRONTIER_RESOURCES: ReadonlySet<string> = new Set(["NEURAL_RESIN", "CONDUCTIVE_MINERALS", "CATALYTIC_DEPOSIT"]);
export const RETIRED_FRONTIER_INSTALLATIONS: ReadonlySet<string> = new Set(["RESIN_EXTRACTOR", "IMPLANT_FOUNDRY", "CATALYST_REFINERY"]);
// Phase 2 replaced the on-deposit Mine and Umbrite Rig and the radius Ore
// Refinery with town refineries (packages/shared/src/refineries/). The bare
// deposit keeps its base slot; the old building record is dropped.
export const RETIRED_DEPOSIT_IMPROVEMENTS: ReadonlySet<string> = new Set(["MINE", "UMBRITE_RIG", "ORE_REFINERY"]);

/** The tile without any retired frontier deposit, installation or deposit improvement; the same object when nothing is retired. */
export const withoutRetiredFrontierMaterials = (tile: DomainTileState): DomainTileState => {
  const retiredResource = tile.resource !== undefined && RETIRED_FRONTIER_RESOURCES.has(tile.resource);
  const retiredBuilding = tile.economicStructure !== undefined && tile.economicStructure !== null &&
    (RETIRED_FRONTIER_INSTALLATIONS.has(tile.economicStructure.type) || RETIRED_DEPOSIT_IMPROVEMENTS.has(tile.economicStructure.type));
  if (!retiredResource && !retiredBuilding) return tile;
  const { resource, economicStructure, ...rest } = tile;
  return {
    ...rest,
    ...(retiredResource || resource === undefined ? {} : { resource }),
    ...(retiredBuilding || economicStructure === undefined ? {} : { economicStructure })
  };
};

/** Strips retired materials from every tile in place; returns how many tiles changed. */
export const stripRetiredFrontierMaterials = (tiles: Map<string, DomainTileState>): number => {
  let changed = 0;
  for (const [key, tile] of tiles) {
    const next = withoutRetiredFrontierMaterials(tile);
    if (next === tile) continue;
    tiles.set(key, next);
    changed += 1;
  }
  return changed;
};
