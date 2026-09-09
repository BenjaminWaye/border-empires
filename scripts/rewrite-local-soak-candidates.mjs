// Candidate-generation half of rewrite-local-soak.mjs, extracted out so the
// soak driver stays under the repo's 500-line file-size gate (see
// AGENTS.md's file-and-type-discipline rule -- rewrite-local-soak.mjs was
// already over the cap before this file existed).
//
// Fixed-border reach (packages/shared/src/reach/reach.ts): EXPAND is only
// legal onto a tile inside the acting player's granted border — a disk
// around each of their TOWN/OUTPOST/DOCK anchors, not "any tile adjacent to
// something I already own" like the old unlimited-adjacency model this
// candidate generator predates. Without this the generator keeps proposing
// targets past the border edge, which the server now hard-rejects with
// OUT_OF_REACH.
import { tileKeysInReach } from "../packages/shared/dist/reach/reach.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../packages/shared/dist/config.js";

export const tileKey = (x, y) => `${x},${y}`;

// Wire tiles never carry nested `town`/`siegeOutpost`/`economicStructure`
// objects (see domainTileToWireDelta in
// apps/simulation/src/runtime-tile-deltas.ts, the source of both INIT's
// initialState.tiles and TILE_DELTA_BATCH): town is flattened straight to
// scalar townType/townName/townPopulationTier fields, while siegeOutpost and
// economicStructure only ever arrive as JSON-stringified blobs
// (siegeOutpostJson/economicStructureJson) that must be parsed to reach
// their .status/.ownerId. Parse defensively — a malformed blob should be
// treated as "no structure", not crash the soak.
const tryParseJson = (raw) => {
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

export const normalizeTile = (tile) => {
  const siegeOutpost = tryParseJson(tile.siegeOutpostJson);
  const economicStructure = tryParseJson(tile.economicStructureJson);
  return {
    x: Number(tile.x),
    y: Number(tile.y),
    ...(typeof tile.terrain === "string" ? { terrain: tile.terrain } : {}),
    ...(typeof tile.resource === "string" ? { resource: tile.resource } : {}),
    ...(typeof tile.ownerId === "string" ? { ownerId: tile.ownerId } : {}),
    ...(typeof tile.ownershipState === "string" ? { ownershipState: tile.ownershipState } : {}),
    // Reach-anchor fields (see the reach import above). Only ever set when
    // present on an update, never explicitly cleared on loss — matches the
    // real border's own "sticky" semantics (a tile a structure once
    // anchored stays granted even after that structure is gone), so
    // treating a once-seen anchor as still anchoring here is the right
    // approximation, not a bug.
    ...(typeof tile.townType === "string" ? { townType: tile.townType } : {}),
    ...(typeof tile.dockId === "string" ? { dockId: tile.dockId } : {}),
    ...(siegeOutpost ? { siegeOutpostStatus: siegeOutpost.status, siegeOutpostOwnerId: siegeOutpost.ownerId } : {}),
    ...(economicStructure
      ? {
          economicStructureType: economicStructure.type,
          economicStructureStatus: economicStructure.status,
          economicStructureOwnerId: economicStructure.ownerId
        }
      : {})
  };
};

// Local mirror of gatherReachAnchors' TOWN/OUTPOST/DOCK detection
// (apps/simulation/src/runtime/runtime.ts), scoped to just the acting
// player's own anchors — candidate generation only needs "can I reach this
// target", not the full multi-player contest logic. A tile can anchor via
// more than one kind at once (e.g. a town tile that's also a dock), so
// every qualifying kind contributes its disk rather than picking one.
const collectOwnReachAnchors = (tilesByKey, playerId) => {
  const anchors = [];
  for (const tile of tilesByKey.values()) {
    if (!tile || tile.ownerId !== playerId) continue;
    const settled = tile.ownershipState === "SETTLED";
    if (settled && tile.townType) {
      anchors.push({ x: tile.x, y: tile.y, ownerId: playerId, activatedAt: 0, kind: "TOWN" });
    }
    if (settled && tile.siegeOutpostStatus === "active" && tile.siegeOutpostOwnerId === playerId) {
      anchors.push({ x: tile.x, y: tile.y, ownerId: playerId, activatedAt: 0, kind: "OUTPOST" });
    }
    if (
      settled &&
      tile.economicStructureType === "RELAY_BEACON" &&
      tile.economicStructureStatus === "active" &&
      tile.economicStructureOwnerId === playerId
    ) {
      anchors.push({ x: tile.x, y: tile.y, ownerId: playerId, activatedAt: 0, kind: "OUTPOST" });
    }
    // DOCK deliberately not gated on ownershipState — mirrors
    // gatherReachAnchors' own comment: a freshly captured dock lands
    // FRONTIER, and its reach bubble should still count immediately.
    if (typeof tile.dockId === "string") {
      anchors.push({ x: tile.x, y: tile.y, ownerId: playerId, activatedAt: 0, kind: "DOCK" });
    }
  }
  return anchors;
};

const computeOwnReachSet = (tilesByKey, playerId) => {
  const reach = new Set();
  for (const anchor of collectOwnReachAnchors(tilesByKey, playerId)) {
    for (const key of tileKeysInReach(anchor)) reach.add(key);
  }
  return reach;
};

const candidateScore = (tilesByKey, payload, playerId, candidateVisionRadius) => {
  const { toX, toY, type } = payload;
  let score = 0;
  for (let dy = -candidateVisionRadius; dy <= candidateVisionRadius; dy += 1) {
    for (let dx = -candidateVisionRadius; dx <= candidateVisionRadius; dx += 1) {
      const neighbor = tilesByKey.get(tileKey(toX + dx, toY + dy));
      if (!neighbor) {
        score += 4;
        continue;
      }
      if (neighbor.terrain !== "LAND") {
        score -= 8;
        continue;
      }
      if (!neighbor.ownerId) {
        score += 3;
        continue;
      }
      if (neighbor.ownerId !== playerId) {
        score += type === "ATTACK" ? 2 : 1;
        continue;
      }
      score -= 1;
    }
  }
  return score;
};

export const collectCandidatePayloads = (
  tilesByKey,
  playerId,
  invalidTargets = new Set(),
  invalidOrigins = new Set(),
  { allowAttacks, candidateVisionRadius }
) => {
  const expandPayloads = [];
  const attackPayloads = [];
  // ATTACK is deliberately not reach-gated (see reach.ts's own doc comment),
  // so this set only needs to filter EXPAND targets.
  const reachSet = computeOwnReachSet(tilesByKey, playerId);
  // isFrontierAdjacent (apps/simulation/src/frontier-adjacency/frontier-adjacency.ts)
  // allows all 8 Chebyshev-1 neighbors, wrapped toroidally at the world
  // edges -- matching only the 4 cardinal directions here understates real
  // adjacency and can make a fully-claimed-on-the-cardinals empire look
  // landlocked when a legal diagonal or wraparound target exists.
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ];

  for (const tile of tilesByKey.values()) {
    if (!tile || tile.ownerId !== playerId || tile.terrain !== "LAND") continue;
    for (const [dx, dy] of directions) {
      const nextOriginKey = tileKey(tile.x, tile.y);
      const nextX = (((tile.x + dx) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
      const nextY = (((tile.y + dy) % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
      const nextTargetKey = tileKey(nextX, nextY);
      if (invalidOrigins.has(nextOriginKey) || invalidTargets.has(nextTargetKey)) continue;
      const neighbor = tilesByKey.get(nextTargetKey);
      if (!neighbor) {
        if (reachSet.has(nextTargetKey)) {
          expandPayloads.push({
            type: "EXPAND",
            fromX: tile.x,
            fromY: tile.y,
            toX: nextX,
            toY: nextY
          });
        }
        continue;
      }
      if (neighbor.terrain !== "LAND") continue;
      if (!neighbor.ownerId) {
        if (reachSet.has(nextTargetKey)) {
          expandPayloads.push({
            type: "EXPAND",
            fromX: tile.x,
            fromY: tile.y,
            toX: neighbor.x,
            toY: neighbor.y
          });
        }
        continue;
      }
      if (neighbor.ownerId !== playerId) {
        attackPayloads.push({
          type: "ATTACK",
          fromX: tile.x,
          fromY: tile.y,
          toX: neighbor.x,
          toY: neighbor.y
        });
      }
    }
  }

  const rankedExpands = expandPayloads
    .map((payload) => ({ payload, score: candidateScore(tilesByKey, payload, playerId, candidateVisionRadius) }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.payload);
  const rankedAttacks = attackPayloads
    .map((payload) => ({ payload, score: candidateScore(tilesByKey, payload, playerId, candidateVisionRadius) }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.payload);

  if (allowAttacks) {
    return rankedExpands.length > 0 ? [...rankedExpands, ...rankedAttacks] : rankedAttacks;
  }

  // Even with attacks not explicitly requested, don't hand back an empty
  // candidate list when EXPAND has nothing but a legal ATTACK exists -- an
  // accepted ATTACK's COMMAND_QUEUED -> ACTION_ACCEPTED round trip is just
  // as valid a human-interactive latency sample as an EXPAND's, and
  // returning nothing here is exactly what silently skips the gate's
  // acceptedP95Ms/acceptedP99Ms checks (soak ends with acceptedSamples: 0)
  // instead of actually measuring anything.
  if (rankedExpands.length === 0 && rankedAttacks.length > 0) {
    return rankedAttacks;
  }

  return rankedExpands;
};
