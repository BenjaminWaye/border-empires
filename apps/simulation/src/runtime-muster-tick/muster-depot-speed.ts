import type { DomainTileState } from "@border-empires/game-domain";
import { MUSTER_DEPOT_SPEED_MULT, OUTPOST_DEPOT_RADIUS, RAIL_DEPOT_BOOSTED_MUSTER_MULT, RAIL_DEPOT_MUSTER_RADIUS } from "@border-empires/shared";
import { chebyshevDistanceSimple, coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { MusterTickInput } from "./runtime-muster-tick.js";

export type Position = { x: number; y: number };

/**
 * Returns the muster speed multiplier for a tile:
 *   - RAIL_DEPOT_BOOSTED_MUSTER_MULT if an outpost within OUTPOST_DEPOT_RADIUS
 *     is itself within RAIL_DEPOT_MUSTER_RADIUS of a Rail Depot
 *   - MUSTER_DEPOT_SPEED_MULT if an outpost is within OUTPOST_DEPOT_RADIUS but
 *     none of the nearby outposts are depot-backed
 *   - 1.0 if no outpost is nearby
 *
 * Checks every outpost within range (not just the closest one) because the
 * closest outpost to this tile isn't necessarily the one nearest a depot.
 *
 * Extracted out of runtime-muster-tick.ts (an already-oversized file — see
 * AGENTS.md's file-line-limit rule) alongside its two helpers below, since
 * all three form one cohesive "outpost/depot proximity" unit used only from
 * tickMuster.
 */
export const musterSpeedMultiplier = (
  tile: DomainTileState,
  outpostKeys: Set<string>,
  depotPositions: ReadonlyArray<Position>
): number => {
  if (outpostKeys.size === 0) return 1;

  const nearbyOutposts = outpostsWithinRadius(tile, outpostKeys);
  if (nearbyOutposts.length === 0) return 1;
  if (depotPositions.length === 0) return MUSTER_DEPOT_SPEED_MULT;

  for (const outpost of nearbyOutposts) {
    for (const depot of depotPositions) {
      if (chebyshevDistanceSimple(outpost.x, outpost.y, depot.x, depot.y) <= RAIL_DEPOT_MUSTER_RADIUS) {
        return RAIL_DEPOT_BOOSTED_MUSTER_MULT;
      }
    }
  }
  return MUSTER_DEPOT_SPEED_MULT;
};

/** All active outpost tiles within OUTPOST_DEPOT_RADIUS of the given tile. */
const outpostsWithinRadius = (tile: DomainTileState, outpostKeys: Set<string>): Position[] => {
  const found: Position[] = [];
  if (outpostKeys.has(simulationTileKey(tile.x, tile.y))) found.push({ x: tile.x, y: tile.y });
  for (const { x, y } of coordsInChebyshevRadius(tile.x, tile.y, OUTPOST_DEPOT_RADIUS)) {
    if (outpostKeys.has(simulationTileKey(x, y))) found.push({ x, y });
  }
  return found;
};

/** Non-dormant siege outpost / relay beacon tile keys for a player (muster-speed proximity source). */
export const outpostTileKeysForPlayer = (input: MusterTickInput, playerId: string): Set<string> => {
  const keys = new Set<string>();
  const siege = input.activeSiegeOutpostsByOwner.get(playerId);
  if (siege) {
    for (const key of siege) {
      if (!input.isStructureDormant(playerId, key, "siegeOutpost")) keys.add(key);
    }
  }
  const light = input.activeRelayBeaconsByOwner.get(playerId);
  if (light) {
    for (const key of light) {
      if (!input.isStructureDormant(playerId, key, "economicStructure")) keys.add(key);
    }
  }
  return keys;
};
