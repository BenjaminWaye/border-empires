// Simulation glue for town refineries (docs/territory-development-plan.md,
// Phase 2): which of a player's deposit tiles a working refinery processes,
// for resourceSlotSupplyForPlayer. Recomputed from tiles on every supply
// rebuild (the supply cache already invalidates on the owner's tile changes);
// nothing is cached here. The refinery rules themselves are pure, in
// packages/shared/src/refineries/.
import type { DomainTileState } from "@border-empires/game-domain";
import {
  evaluateRefineries, isRefineryType, refinerySlotBonusesByTile,
  type RefineryEvaluation, type RefinerySlotBonus, type RefineryTile, type RefineryTownResolver
} from "@border-empires/shared";
import { assignedTownKeyForSupportTile, type TownSupportTile } from "../town-support-lookup.js";

export type RefinerySlotBonuses = ReadonlyMap<string, readonly RefinerySlotBonus[]>;
export const NO_REFINERY_SLOT_BONUSES: RefinerySlotBonuses = new Map();

/** The support-ring town resolver every refinery path uses (the same one the build command and district projection use). */
export const refineryTownResolver = <T extends TownSupportTile>(tiles: ReadonlyMap<string, T>): RefineryTownResolver =>
  (ownerId, x, y) => assignedTownKeyForSupportTile(tiles, ownerId, x, y);

/** Every refinery among `ownedTiles`, evaluated against the full tile map. */
export const evaluateOwnedRefineries = <T extends RefineryTile & TownSupportTile>(
  tiles: ReadonlyMap<string, T>, ownedTiles: Iterable<RefineryTile>
): Map<string, RefineryEvaluation> => {
  const refineryTiles: RefineryTile[] = [];
  for (const tile of ownedTiles) if (isRefineryType(tile.economicStructure?.type)) refineryTiles.push(tile);
  if (refineryTiles.length === 0) return new Map();
  return evaluateRefineries(tiles, refineryTiles, refineryTownResolver(tiles));
};

/** Per processed tile, the refinery (and booster) slots its owner gets. */
export const refinerySlotBonusesForTiles = <T extends RefineryTile & TownSupportTile>(
  tiles: ReadonlyMap<string, T>, ownedTiles: Iterable<RefineryTile>
): RefinerySlotBonuses => {
  const evaluations = evaluateOwnedRefineries(tiles, ownedTiles);
  return evaluations.size === 0 ? NO_REFINERY_SLOT_BONUSES : refinerySlotBonusesByTile(evaluations.values());
};

/** Domain-tile convenience for the live runtime. */
export const refinerySlotBonusesForPlayer = (
  tiles: ReadonlyMap<string, DomainTileState>, settledTiles: Iterable<DomainTileState>
): RefinerySlotBonuses => refinerySlotBonusesForTiles(tiles, settledTiles);

/**
 * For the cold/reconnect snapshot paths, which hold wire-parsed settled tiles:
 * empty unless one of them is a refinery, and only then reads the (lazily
 * built, per-snapshot cached) full tile map.
 */
export const refinerySlotBonusesForParsedTiles = (
  settledTiles: Iterable<{ x: number; y: number; economicStructure?: { type?: string } | null | undefined }>,
  domainTilesByKey: () => ReadonlyMap<string, DomainTileState>
): RefinerySlotBonuses => {
  const keys: string[] = [];
  for (const tile of settledTiles) if (isRefineryType(tile.economicStructure?.type)) keys.push(`${tile.x},${tile.y}`);
  if (keys.length === 0) return NO_REFINERY_SLOT_BONUSES;
  const tiles = domainTilesByKey();
  return refinerySlotBonusesForTiles(tiles, keys.map((key) => tiles.get(key)).filter((tile): tile is DomainTileState => Boolean(tile)));
};
