import type { DomainTileState } from "@border-empires/game-domain";
import { isAlliedOrTruced } from "../runtime-player-factory.js";
import { coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { MusterTickInput } from "./runtime-muster-tick.js";
import { ADVANCE_MAX_RANGE_TILES } from "./muster-auto-fire-shared.js";

/**
 * True when an AI-owned flag still has something to attack within its ADVANCE
 * reach: an enemy player's tile or a barbarian's. Once it has neither -- the
 * war it was planted for is over (a truce or alliance was signed, or the
 * enemy's border is gone) and no barbarians are left to clear -- the flag is
 * disbanded. Nothing else clears an AI flag: before this, a flag planted
 * against a player who then signed a truce sat there for MUSTER_STALE_MS (two
 * days), locking up manpower it could never spend.
 *
 * Barbarians keep a flag up because ADVANCE does attack them (see
 * scanAdvanceCandidates), so the flag is still spending its manpower. The AI
 * never plants a flag against barbarians, so this doesn't cause a
 * disband/re-plant cycle: the flag just stays until they are cleared.
 *
 * Walks the same ground as scanAdvanceCandidates (the flag owner's connected
 * land, dock and aether-bridge links as one hop, capped at
 * ADVANCE_MAX_RANGE_TILES) but ignores combat locks: a target that is merely
 * under attack right now is still an enemy, and the flag must survive the fight.
 */
export const aiFlagHasTargetInReach = (input: MusterTickInput, flag: DomainTileState, playerId: string): boolean => {
  const actor = input.players.get(playerId);
  if (!actor) return false;
  const bridgeLinksByKey = input.aetherBridgeNeighborKeysForPlayer(playerId);
  const originKey = simulationTileKey(flag.x, flag.y);
  const depthByKey = new Map<string, number>([[originKey, 0]]);
  const queue: DomainTileState[] = [flag];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    const currentKey = simulationTileKey(current.x, current.y);
    const currentDepth = depthByKey.get(currentKey)!;
    const linkedCoords = [
      ...(input.dockCrossingTargetsByDockTileKey.get(currentKey) ?? []),
      ...(bridgeLinksByKey.get(currentKey) ?? [])
    ].map((key) => {
      const [x, y] = key.split(",").map(Number);
      return { x: x!, y: y! };
    });
    for (const { x, y } of [...coordsInChebyshevRadius(current.x, current.y, 1), ...linkedCoords]) {
      const key = simulationTileKey(x, y);
      const neighbor = input.tiles.get(key);
      if (!neighbor || neighbor.terrain !== "LAND" || !neighbor.ownerId) continue;
      if (neighbor.ownerId === playerId) {
        if (!depthByKey.has(key) && currentDepth + 1 < ADVANCE_MAX_RANGE_TILES) {
          depthByKey.set(key, currentDepth + 1);
          queue.push(neighbor);
        }
        continue;
      }
      if (
        (neighbor.ownershipState === "FRONTIER" || neighbor.ownershipState === "SETTLED" || neighbor.ownershipState === "BARBARIAN") &&
        !isAlliedOrTruced(actor, neighbor.ownerId)
      ) {
        return true;
      }
    }
  }
  return false;
};
