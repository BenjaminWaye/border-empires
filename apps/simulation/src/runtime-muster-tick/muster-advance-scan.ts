import type { DomainTileState } from "@border-empires/game-domain";
import { chebyshevDistanceSimple, coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { isAlliedOrTruced } from "../runtime-player-factory.js";
import type { MusterTickInput } from "./runtime-muster-tick.js";
import { ADVANCE_MAX_RANGE_TILES, isNearerAdvanceCandidate, type AdvanceCandidate } from "./muster-auto-fire-shared.js";

/**
 * ADVANCE's candidate scan, split out of runtime-muster-tick.ts: a BFS through
 * the player's connected owned tiles from the flag, returning the nearest
 * attackable enemy tile (whether or not the flag can afford it yet) and the
 * nearest one it can afford right now. See pickAdvanceTarget for how the two
 * are used.
 */
export const scanAdvanceCandidates = (
  input: MusterTickInput,
  musterTile: DomainTileState,
  playerId: string,
  availableMuster: number
): { nearest: AdvanceCandidate | undefined; nearestAffordable: AdvanceCandidate | undefined } => {
  const originKey = simulationTileKey(musterTile.x, musterTile.y);
  const getTile = (x: number, y: number): DomainTileState | undefined =>
    input.tiles.get(simulationTileKey(x, y));

  // BFS through connected owned tiles, collecting every attackable enemy tile
  // found along the way instead of stopping at the first one. Tracks each
  // owned tile's hop depth from the flag (a dock link is one hop regardless
  // of the real distance it crosses) so both the range cap and the
  // nearest-candidate tie-break are dock-fair; Chebyshev distance only breaks
  // ties between candidates found at the same hop depth.
  // Uses a head pointer instead of shift() to keep dequeue O(1).
  const bridgeLinksByKey = input.aetherBridgeNeighborKeysForPlayer(playerId);
  const actor = input.players.get(playerId);
  const visited = new Set<string>([originKey]);
  const depthByKey = new Map<string, number>([[originKey, 0]]);
  const queue: DomainTileState[] = [musterTile];
  let head = 0;
  // Nearest reachable/unlocked enemy tile regardless of whether this flag
  // can currently afford it. The flag commits to this tile: if it can't pay
  // yet it saves up rather than spending its manpower on a cheaper, farther
  // tile (see pickAdvanceTarget).
  let nearest: AdvanceCandidate | undefined;
  // Nearest tile the flag can pay for right now -- only used as the fallback
  // when `nearest` costs more than this flag can hold (its musterFlagCap).
  let nearestAffordable: AdvanceCandidate | undefined;

  while (head < queue.length) {
    const current = queue[head++]!;
    const currentKey = simulationTileKey(current.x, current.y);
    const currentDepth = depthByKey.get(currentKey)!;

    const dockLinkedKeys = input.dockLinksByDockTileKey.get(currentKey) ?? [];
    const bridgeLinkedKeys = bridgeLinksByKey.get(currentKey) ?? [];
    const neighborCoords = [
      ...coordsInChebyshevRadius(current.x, current.y, 1),
      ...dockLinkedKeys.map((key) => {
        const [nx, ny] = key.split(",").map(Number);
        return { x: nx!, y: ny! };
      }),
      ...bridgeLinkedKeys.map((key) => {
        const [nx, ny] = key.split(",").map(Number);
        return { x: nx!, y: ny! };
      })
    ];

    for (const { x, y } of neighborCoords) {
      const neighbor = getTile(x, y);
      if (!neighbor || neighbor.terrain !== "LAND") continue;
      const nKey = simulationTileKey(x, y);

      if (neighbor.ownerId === playerId) {
        // Bound the traversal, not just the result. ADVANCE_MAX_RANGE_TILES
        // was previously only a filter on candidates (below, and at the
        // `best.hops >` check after the loop), so the walk itself still
        // covered the player's entire connected territory every tick, for
        // every raised flag -- O(owned tiles) of map lookups and per-tile
        // array allocation whose results were then thrown away past the cap.
        // On a big empire under live load that is the sim's hottest loop.
        //
        // Stopping here is result-identical: an owned tile at depth d only
        // contributes enemy candidates at d + 1, and every candidate past
        // ADVANCE_MAX_RANGE_TILES is discarded anyway. So a tile at depth
        // >= the cap can only produce already-rejected candidates, and never
        // expanding it cannot change which target is chosen.
        if (!visited.has(nKey) && currentDepth + 1 < ADVANCE_MAX_RANGE_TILES) {
          visited.add(nKey);
          depthByKey.set(nKey, currentDepth + 1);
          queue.push(neighbor);
        }
      } else if (
        neighbor.ownerId &&
        (neighbor.ownershipState === "FRONTIER" || neighbor.ownershipState === "SETTLED" || neighbor.ownershipState === "BARBARIAN") &&
        // An ally's or truced player's tile is not a target: the attack would
        // only be rejected, and as the nearest candidate it would be re-picked
        // every tick in front of real enemies.
        !(actor && isAlliedOrTruced(actor, neighbor.ownerId)) &&
        !input.locksByTile.has(currentKey) &&
        !input.locksByTile.has(nKey)
      ) {
        const candidate: AdvanceCandidate = {
          from: current,
          enemy: neighbor,
          hops: currentDepth + 1,
          dist: chebyshevDistanceSimple(musterTile.x, musterTile.y, neighbor.x, neighbor.y),
          required: input.requiredMusterForTarget(neighbor)
        };
        if (isNearerAdvanceCandidate(candidate, nearest)) nearest = candidate;
        if (availableMuster >= candidate.required && isNearerAdvanceCandidate(candidate, nearestAffordable)) nearestAffordable = candidate;
      }
    }
  }


  return { nearest, nearestAffordable };
};
