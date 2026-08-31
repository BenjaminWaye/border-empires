// Support-ring structure lookups split out of economy-network.ts to keep
// that file (already over the repo's 500-line cap) from growing further.
// These are the DomainTileState-based, authoritative real-economy paths —
// see live-town-summary.ts / tile-detail-snapshot.ts for the wire-shaped
// duplicates that must be kept in sync with this file's logic.
import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

// Wraps both axes so a support-ring loop's x±1/y±1 around a town on the map
// edge resolves to the tile that actually wraps there instead of a
// nonexistent out-of-bounds key (bug: a Mintworks — or any support-ring
// structure — built on a wrapped tile was silently never counted for a town
// near the map's x/y edge, since these loops used to build plain "x,y" keys).
const keyFor = (x: number, y: number): string => `${wrapX(x, WORLD_WIDTH)},${wrapY(y, WORLD_HEIGHT)}`;

// Moved from player-update-economy.ts so buildConnectedTownNetworkForPlayer can
// precompute per-group Clearing House membership without a circular import
// (player-update-economy.ts already imports from this module). Re-exported
// there for existing call sites/tests.
export const supportTileBelongsToTown = (
  playerId: string,
  supportTile: DomainTileState,
  townTile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): boolean => {
  let assignedTown: DomainTileState | undefined;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const candidate = tiles.get(keyFor(supportTile.x + dx, supportTile.y + dy));
      if (!candidate?.town || candidate.ownerId !== playerId || candidate.ownershipState !== "SETTLED") continue;
      if (candidate.town.populationTier === "SETTLEMENT") continue;
      if (!assignedTown || candidate.x < assignedTown.x || (candidate.x === assignedTown.x && candidate.y < assignedTown.y)) {
        assignedTown = candidate;
      }
    }
  }
  return assignedTown?.x === townTile.x && assignedTown.y === townTile.y;
};

export const hasSupportedStructure = (
  playerId: string,
  tile: DomainTileState,
  structureType: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  // Callers checking for a live, functioning bonus (Clearing House gold,
  // Garrison Hall/Rail Depot manpower) want the default active-only
  // semantics. Callers enforcing a *uniqueness* constraint (§4.4: "only one
  // Rail Depot per network") need under_construction to count too — the
  // build handler never re-validates uniqueness at completion
  // (completeStructureBuild in runtime-structure-command-handlers.ts just
  // flips status to active unconditionally), so two Rail Depot builds
  // submitted before either finishes would otherwise both pass validation
  // and leave the network with two permanent depots.
  includeUnderConstruction = false,
  // §5.4: a dormant structure (slot demand not covered by supply) doesn't
  // function even though it's still "active" in construction terms — plain
  // "x,y" tile keys (Runtime.dormantFieldKeysForPlayer("economicStructure")).
  // Deliberately NOT consulted when includeUnderConstruction is true: that
  // mode is a uniqueness check (§4.4's "only one Rail Depot per network"),
  // and dormancy is a transient power state, not a reason to let a second
  // instance be built.
  dormantEconomicStructureKeys: ReadonlySet<string> = new Set()
): boolean => {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tiles.get(keyFor(tile.x + dx, tile.y + dy));
      if (!neighbor || neighbor.ownerId !== playerId || neighbor.ownershipState !== "SETTLED") continue;
      if (!supportTileBelongsToTown(playerId, neighbor, tile, tiles)) continue;
      const structure = neighbor.economicStructure;
      if (structure?.ownerId !== playerId || structure.type !== structureType) continue;
      if (includeUnderConstruction && structure.status === "under_construction") return true;
      if (structure.status === "active" && !dormantEconomicStructureKeys.has(keyFor(neighbor.x, neighbor.y))) return true;
    }
  }
  return false;
};

/**
 * Counting sibling of hasSupportedStructure, for structures whose bonus
 * STACKS with the number of active instances rather than gating on "any one
 * exists" (mintworks-stacking task: Mintworks's town gold production bonus is now
 * additive per-mintworks). Active-only (no includeUnderConstruction param —
 * uniqueness checks that need under_construction stay on the boolean
 * hasSupportedStructure above; nothing needs an under-construction count).
 *
 * Mintworks's structure-placement-metadata.json placementMode is "same_tile"
 * (verified — NOT "town_support"; it shares that placement mode with
 * GARRISON_HALL/IRON_WEAPONS_FACTORY/FUR_WEAPONS_FACTORY), meaning a copy can
 * sit directly ON the town tile itself as well as on any support tile in its
 * ring — so this mirrors countWeaponsFactoriesAt's dual on-tile +
 * support-ring loop below, not hasSupportedStructure's support-ring-only
 * loop (which would silently miss a same-tile-placed instance).
 */
export const countSupportedStructures = (
  playerId: string,
  tile: DomainTileState,
  structureType: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  dormantEconomicStructureKeys: ReadonlySet<string> = new Set()
): number => {
  let count = 0;
  const tileKey = keyFor(tile.x, tile.y);
  if (
    tile.economicStructure?.ownerId === playerId &&
    tile.economicStructure.type === structureType &&
    tile.economicStructure.status === "active" &&
    !dormantEconomicStructureKeys.has(tileKey)
  ) {
    count += 1;
  }
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighborKey = keyFor(tile.x + dx, tile.y + dy);
      const neighbor = tiles.get(neighborKey);
      if (!neighbor || neighbor.ownerId !== playerId || neighbor.ownershipState !== "SETTLED") continue;
      if (!supportTileBelongsToTown(playerId, neighbor, tile, tiles)) continue;
      const structure = neighbor.economicStructure;
      if (
        structure?.ownerId === playerId &&
        structure.type === structureType &&
        structure.status === "active" &&
        !dormantEconomicStructureKeys.has(neighborKey)
      ) {
        count += 1;
      }
    }
  }
  return count;
};
