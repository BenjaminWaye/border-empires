import type { SeasonStats } from "@border-empires/sim-protocol";

/** Enrich old crowns with recomputed final-map details. Complete captured
 * records remain authoritative; casualties only merge for the identical tile
 * and season total, so a partial history can never replace a crowned record. */
export const enrichSavedSeasonStats = (saved: SeasonStats | undefined, derived: SeasonStats | undefined): SeasonStats | undefined => {
  if (!saved) return derived;
  if (!derived) return saved;
  const result: SeasonStats = { ...derived, ...saved };
  const road = saved.longestRoad;
  const derivedRoad = derived.longestRoad;
  if (road && (!road.playerId || !road.fromCity || !road.toCity) &&
      derivedRoad?.tileCount === road.tileCount && derivedRoad.playerId && derivedRoad.fromCity && derivedRoad.toCity) result.longestRoad = derivedRoad;
  const deadly = saved.mostDeadlyTile;
  const derivedDeadly = derived.mostDeadlyTile;
  if (deadly && !deadly.mostLossesPlayer && derivedDeadly?.mostLossesPlayer &&
      deadly.x === derivedDeadly.x && deadly.y === derivedDeadly.y && deadly.manpowerLost === derivedDeadly.manpowerLost) {
    result.mostDeadlyTile = { ...deadly, mostLossesPlayer: derivedDeadly.mostLossesPlayer };
  }
  return result;
};
