/**
 * Spatial focus caps AI per-tick frontier enumeration to a bounded BFS front
 * around a persistent focus origin tile. Large empires would otherwise blow
 * planner CPU on the main event loop (prod observed 30-45s synchronous stalls
 * pre-fix, all inside frontier-command-planner.ts candidate enumeration).
 */

export const AI_SPATIAL_FOCUS_MAX_OWNED_TILES = 1024;
export const AI_SPATIAL_FOCUS_EXPIRY_MS = 60_000;
export const AI_SPATIAL_FOCUS_EXPIRY_JITTER_MS = 15_000;

export type AiSpatialFocus = {
  readonly originTileKey: string;
  readonly primaryFront: ReadonlySet<string>;
  readonly computedAt: number;
  readonly expiresAt: number;
};

const tileKeyOf = (x: number, y: number): string => `${x},${y}`;

const parseTileKey = (tileKey: string): { x: number; y: number } | undefined => {
  const comma = tileKey.indexOf(",");
  if (comma <= 0) return undefined;
  const x = Number(tileKey.slice(0, comma));
  const y = Number(tileKey.slice(comma + 1));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
};

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
];

/**
 * BFS through the 4-neighbor owned-tile graph, starting at `originTileKey`,
 * collecting at most `maxOwnedTiles` tiles. Returns an empty set if the origin
 * is not owned. Output is the bounded front (always includes the origin when
 * non-empty).
 */
export const expandFocusFront = (
  originTileKey: string,
  ownedTileKeys: ReadonlySet<string>,
  maxOwnedTiles = AI_SPATIAL_FOCUS_MAX_OWNED_TILES
): Set<string> => {
  const front = new Set<string>();
  if (!ownedTileKeys.has(originTileKey) || maxOwnedTiles <= 0) return front;
  front.add(originTileKey);
  const queue: string[] = [originTileKey];
  let head = 0;
  while (head < queue.length && front.size < maxOwnedTiles) {
    const current = queue[head++]!;
    const parsed = parseTileKey(current);
    if (!parsed) continue;
    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      if (front.size >= maxOwnedTiles) break;
      const next = tileKeyOf(parsed.x + dx, parsed.y + dy);
      if (front.has(next)) continue;
      if (!ownedTileKeys.has(next)) continue;
      front.add(next);
      queue.push(next);
    }
  }
  return front;
};

/**
 * Pick a focus origin from the player's hot-frontier tiles (owned tiles
 * touching contested borders). Falls back to the first owned tile if the hot
 * set is empty. Returns undefined if the player owns nothing.
 *
 * Iteration order of the input Sets is the insertion order, which the runtime
 * maintains as territory ownership stabilizes — so the same hot frontier tile
 * tends to be picked across ticks when no state has changed.
 */
export const pickFocusOrigin = (
  hotFrontierTileKeys: ReadonlySet<string>,
  ownedTileKeys: ReadonlySet<string>
): string | undefined => {
  for (const tileKey of hotFrontierTileKeys) {
    if (ownedTileKeys.has(tileKey)) return tileKey;
  }
  for (const tileKey of ownedTileKeys) {
    return tileKey;
  }
  return undefined;
};

/**
 * Compute or refresh the AI's spatial focus. Reuses the prior origin when it
 * is still owned and the focus has not expired; otherwise picks a fresh origin
 * from the hot-frontier tiles. When the front grown from the prior origin is
 * identical to the cached one, the prior focus object is returned unchanged so
 * downstream identity checks remain cheap.
 */
export const selectSpatialFocus = (params: {
  prior: AiSpatialFocus | undefined;
  hotFrontierTileKeys: ReadonlySet<string>;
  ownedTileKeys: ReadonlySet<string>;
  now: number;
  jitterMs?: number;
  maxOwnedTiles?: number;
  expiryMs?: number;
}): AiSpatialFocus | undefined => {
  const { prior, hotFrontierTileKeys, ownedTileKeys, now } = params;
  const jitterMs = params.jitterMs ?? 0;
  const maxOwnedTiles = params.maxOwnedTiles ?? AI_SPATIAL_FOCUS_MAX_OWNED_TILES;
  const expiryMs = params.expiryMs ?? AI_SPATIAL_FOCUS_EXPIRY_MS;

  if (ownedTileKeys.size === 0) return undefined;

  const priorOriginStillOwned =
    prior !== undefined && ownedTileKeys.has(prior.originTileKey);
  const priorNotExpired = prior !== undefined && now < prior.expiresAt;
  const reusePriorOrigin = priorOriginStillOwned && priorNotExpired;

  const originTileKey = reusePriorOrigin
    ? prior!.originTileKey
    : pickFocusOrigin(hotFrontierTileKeys, ownedTileKeys);
  if (!originTileKey) return undefined;

  const primaryFront = expandFocusFront(originTileKey, ownedTileKeys, maxOwnedTiles);
  if (primaryFront.size === 0) return undefined;

  if (reusePriorOrigin && prior!.primaryFront.size === primaryFront.size) {
    let identical = true;
    for (const key of primaryFront) {
      if (!prior!.primaryFront.has(key)) {
        identical = false;
        break;
      }
    }
    if (identical) return prior;
  }

  return {
    originTileKey,
    primaryFront,
    computedAt: now,
    expiresAt: now + expiryMs + jitterMs
  };
};
