import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

/**
 * Spatial focus caps AI per-tick frontier enumeration to a bounded BFS front
 * around a persistent focus origin tile. Large empires would otherwise blow
 * planner CPU on the main event loop (prod observed 30-45s synchronous stalls
 * pre-fix, all inside frontier-command-planner.ts candidate enumeration).
 *
 * Cap rationale: the per-AI per-tick cost is roughly
 * `frontSize × ~15 candidates × ~50 tile-map lookups`. The initial #269 cap
 * of 1024 still produced 7s AI tick p99 on a 4h staging soak (5 AIs growing
 * past ~250 owned tiles each). 256 is ~4x cheaper and still gives BFS a
 * radius of ~8 tiles in each direction from a hot-frontier origin — enough
 * to plan a meaningful local action without scanning interior territory the
 * AI isn't acting on this tick.
 *
 * Origin rotation: a single hot-frontier origin biases the front toward the
 * border and hides interior decisions (settling owned FRONTIER tiles deep
 * inside the empire, building structures on settled tiles far from contact).
 * To fix that, the origin category rotates on refresh: hot_frontier →
 * build_candidate → settle_pending → ... back to hot_frontier. Within each
 * category, the origin advances through that category's runtime summary Set so
 * multiple active regions can take turns. An actively changing focus can keep
 * the AI local for several refreshes, but never past the hard focus cap.
 */

export const AI_SPATIAL_FOCUS_MAX_OWNED_TILES = 256;
export const AI_SPATIAL_FOCUS_EXPIRY_MS = 60_000;
export const AI_SPATIAL_FOCUS_EXPIRY_JITTER_MS = 15_000;
export const AI_SPATIAL_FOCUS_HARD_EXPIRY_MS = 10 * 60_000;
// Owned-tile BFS-front membership can churn near the 256-tile boundary even
// when the scan itself is finding nothing actionable, which otherwise keeps
// the focus pinned on a dead front forever (see selectSpatialFocus). Forcing
// rotation after this many consecutive unproductive refreshes bounds
// recovery to ~3-4 minutes without thrashing on a single noisy tick.
export const AI_SPATIAL_FOCUS_MAX_UNPRODUCTIVE_STREAK = 3;

export type AiSpatialFocusCategory = "hot_frontier" | "build_candidate" | "settle_pending";

export const AI_SPATIAL_FOCUS_CATEGORY_CYCLE: ReadonlyArray<AiSpatialFocusCategory> = [
  "hot_frontier",
  "build_candidate",
  "settle_pending"
];

export type AiSpatialFocus = {
  readonly originTileKey: string;
  readonly originCategory: AiSpatialFocusCategory;
  readonly primaryFront: ReadonlySet<string>;
  readonly computedAt: number;
  readonly expiresAt: number;
  readonly hardExpiresAt: number;
  readonly lastOriginByCategory: Readonly<Partial<Record<AiSpatialFocusCategory, string>>>;
  readonly unproductiveStreak: number;
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

const EMPTY_TILE_SET: ReadonlySet<string> = new Set<string>();

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
];

/**
 * BFS through the wrapping 8-neighbor owned-tile graph, starting at
 * `originTileKey`, collecting at most `maxOwnedTiles` tiles. Returns an empty
 * set if the origin is not owned. Output is the bounded front (always includes
 * the origin when non-empty).
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
      const next = tileKeyOf(
        wrapX(parsed.x + dx, WORLD_WIDTH),
        wrapY(parsed.y + dy, WORLD_HEIGHT)
      );
      if (front.has(next)) continue;
      if (!ownedTileKeys.has(next)) continue;
      front.add(next);
      queue.push(next);
    }
  }
  return front;
};

const nextCategoryAfter = (prior: AiSpatialFocusCategory | undefined): AiSpatialFocusCategory => {
  if (prior === undefined) return AI_SPATIAL_FOCUS_CATEGORY_CYCLE[0]!;
  const idx = AI_SPATIAL_FOCUS_CATEGORY_CYCLE.indexOf(prior);
  if (idx < 0) return AI_SPATIAL_FOCUS_CATEGORY_CYCLE[0]!;
  return AI_SPATIAL_FOCUS_CATEGORY_CYCLE[(idx + 1) % AI_SPATIAL_FOCUS_CATEGORY_CYCLE.length]!;
};

const firstOwnedTileIn = (
  candidates: ReadonlySet<string>,
  ownedTileKeys: ReadonlySet<string>,
  afterTileKey?: string | undefined
): string | undefined => {
  if (afterTileKey !== undefined && candidates.has(afterTileKey)) {
    let pastPrior = false;
    let firstOwned: string | undefined;
    for (const tileKey of candidates) {
      if (ownedTileKeys.has(tileKey) && firstOwned === undefined) firstOwned = tileKey;
      if (tileKey === afterTileKey) {
        pastPrior = true;
        continue;
      }
      if (pastPrior && ownedTileKeys.has(tileKey)) return tileKey;
    }
    return firstOwned;
  }
  for (const tileKey of candidates) {
    if (ownedTileKeys.has(tileKey)) return tileKey;
  }
  return undefined;
};

/**
 * Pick a focus origin by cycling through category-specific tile sets starting
 * at `startCategory`. Returns the first owned tile from the first non-empty
 * category, along with the category that produced it. Falls back to the first
 * owned tile if every category is empty/unowned. Returns undefined only when
 * the player owns nothing.
 *
 * Iteration order of the input Sets is the insertion order, which the runtime
 * maintains as territory ownership stabilises — so the same origin tends to be
 * picked across refreshes when no state has changed, which keeps the BFS front
 * stable and lets downstream identity checks short-circuit.
 */
export const pickFocusOriginForCategory = (
  startCategory: AiSpatialFocusCategory,
  sources: Readonly<Record<AiSpatialFocusCategory, ReadonlySet<string>>>,
  ownedTileKeys: ReadonlySet<string>,
  lastOriginByCategory: Readonly<Partial<Record<AiSpatialFocusCategory, string>>> = {}
): { originTileKey: string; originCategory: AiSpatialFocusCategory } | undefined => {
  for (let attempt = 0; attempt < AI_SPATIAL_FOCUS_CATEGORY_CYCLE.length; attempt += 1) {
    const idx = (AI_SPATIAL_FOCUS_CATEGORY_CYCLE.indexOf(startCategory) + attempt) % AI_SPATIAL_FOCUS_CATEGORY_CYCLE.length;
    const category = AI_SPATIAL_FOCUS_CATEGORY_CYCLE[idx]!;
    const candidate = firstOwnedTileIn(sources[category], ownedTileKeys, lastOriginByCategory[category]);
    if (candidate) return { originTileKey: candidate, originCategory: category };
  }
  for (const tileKey of ownedTileKeys) {
    return { originTileKey: tileKey, originCategory: startCategory };
  }
  return undefined;
};

/**
 * Compute or refresh the AI's spatial focus. Reuses the prior origin when it
 * is still owned and the focus has not expired; otherwise rotates to the next
 * category in AI_SPATIAL_FOCUS_CATEGORY_CYCLE and picks a fresh origin from
 * that category (or the next non-empty one). When the rebuilt front from the
 * prior origin is identical to the cached one, the prior focus object is
 * returned unchanged so downstream identity checks stay cheap.
 */
export const selectSpatialFocus = (params: {
  prior: AiSpatialFocus | undefined;
  hotFrontierTileKeys: ReadonlySet<string>;
  buildCandidateTileKeys?: ReadonlySet<string>;
  settlePendingTileKeys?: ReadonlySet<string>;
  ownedTileKeys: ReadonlySet<string>;
  now: number;
  jitterMs?: number;
  maxOwnedTiles?: number;
  expiryMs?: number;
  hardExpiryMs?: number;
  /** Whether the previous scan of this front found anything actionable.
   *  undefined means "no signal yet" (first refresh, or a tick where the
   *  scan never ran) and is treated as productive so a focus is never
   *  force-rotated off before it's actually been evaluated. */
  lastScanWasProductive?: boolean | undefined;
  maxUnproductiveStreak?: number;
}): AiSpatialFocus | undefined => {
  const { prior, hotFrontierTileKeys, ownedTileKeys, now } = params;
  const buildCandidateTileKeys = params.buildCandidateTileKeys ?? EMPTY_TILE_SET;
  const settlePendingTileKeys = params.settlePendingTileKeys ?? EMPTY_TILE_SET;
  const jitterMs = params.jitterMs ?? 0;
  const maxOwnedTiles = params.maxOwnedTiles ?? AI_SPATIAL_FOCUS_MAX_OWNED_TILES;
  const expiryMs = params.expiryMs ?? AI_SPATIAL_FOCUS_EXPIRY_MS;
  const hardExpiryMs = params.hardExpiryMs ?? AI_SPATIAL_FOCUS_HARD_EXPIRY_MS;
  const maxUnproductiveStreak = params.maxUnproductiveStreak ?? AI_SPATIAL_FOCUS_MAX_UNPRODUCTIVE_STREAK;
  const lastScanWasProductive = params.lastScanWasProductive ?? true;

  if (ownedTileKeys.size === 0) return undefined;

  const sources: Record<AiSpatialFocusCategory, ReadonlySet<string>> = {
    hot_frontier: hotFrontierTileKeys,
    build_candidate: buildCandidateTileKeys,
    settle_pending: settlePendingTileKeys
  };

  const priorLastOriginByCategory = prior
    ? {
        ...prior.lastOriginByCategory,
        [prior.originCategory]: prior.originTileKey
      }
    : {};
  const softExpiresAt = now + expiryMs + jitterMs;
  const priorOriginStillOwned =
    prior !== undefined && ownedTileKeys.has(prior.originTileKey);
  const priorHardExpiresAt = prior?.hardExpiresAt ?? (prior ? prior.computedAt + hardExpiryMs : now);
  const priorCanContinue = priorOriginStillOwned && now < priorHardExpiresAt;
  if (priorCanContinue) {
    if (now < prior.expiresAt) return prior;
    const candidateStreak = lastScanWasProductive ? 0 : (prior.unproductiveStreak ?? 0) + 1;
    const forceRotate = candidateStreak >= maxUnproductiveStreak;
    if (!forceRotate) {
      const refreshedPriorFront = expandFocusFront(prior.originTileKey, ownedTileKeys, maxOwnedTiles);
      const priorFrontChanged = !setsEqual(refreshedPriorFront, prior.primaryFront);
      if (priorFrontChanged) {
        return {
          originTileKey: prior.originTileKey,
          originCategory: prior.originCategory,
          primaryFront: refreshedPriorFront,
          computedAt: now,
          expiresAt: Math.min(softExpiresAt, priorHardExpiresAt),
          hardExpiresAt: priorHardExpiresAt,
          lastOriginByCategory: priorLastOriginByCategory,
          unproductiveStreak: candidateStreak
        };
      }
    }
    // Either the front's owned-tile membership is stable, or it kept
    // "changing" (topology churn) while producing nothing actionable for
    // maxUnproductiveStreak refreshes in a row — in both cases fall through
    // to category rotation below instead of re-pinning the same origin.
  }

  let originTileKey: string | undefined;
  let originCategory: AiSpatialFocusCategory;
  const startCategory = nextCategoryAfter(prior?.originCategory);
  const picked = pickFocusOriginForCategory(startCategory, sources, ownedTileKeys, priorLastOriginByCategory);
  if (!picked) return undefined;
  originTileKey = picked.originTileKey;
  originCategory = picked.originCategory;
  if (!originTileKey) return undefined;

  const primaryFront = expandFocusFront(originTileKey, ownedTileKeys, maxOwnedTiles);
  if (primaryFront.size === 0) return undefined;
  const nextLastOriginByCategory = {
    ...priorLastOriginByCategory,
    [originCategory]: originTileKey
  };

  return {
    originTileKey,
    originCategory,
    primaryFront,
    computedAt: now,
    expiresAt: softExpiresAt,
    hardExpiresAt: now + hardExpiryMs,
    lastOriginByCategory: nextLastOriginByCategory,
    unproductiveStreak: 0
  };
};

const setsEqual = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean => {
  if (left.size !== right.size) return false;
  for (const key of left) {
    if (!right.has(key)) return false;
  }
  return true;
};

/**
 * Per-tick entry point runtime.ts calls to refresh a player's spatial focus.
 * Wraps selectSpatialFocus with the persistent-map bookkeeping (clear on
 * zero territory, write the new focus, clear the productivity cache when
 * focus is lost) — factored out of runtime.ts (which owns the two Maps) to
 * keep that file under the repo's line cap.
 */
export const refreshSpatialFocus = (params: {
  playerId: string;
  now: number;
  territoryTileKeys: ReadonlySet<string>;
  hotFrontierTileKeys: ReadonlySet<string>;
  buildCandidateTileKeys: ReadonlySet<string>;
  frontierTileKeys: ReadonlySet<string>;
  focusByPlayer: Map<string, AiSpatialFocus>;
  productiveByPlayer: Map<string, boolean>;
}): AiSpatialFocus | undefined => {
  const {
    playerId, now, territoryTileKeys, hotFrontierTileKeys,
    buildCandidateTileKeys, frontierTileKeys, focusByPlayer, productiveByPlayer
  } = params;
  if (territoryTileKeys.size <= 0) {
    focusByPlayer.delete(playerId);
    productiveByPlayer.delete(playerId);
    return undefined;
  }
  const prior = focusByPlayer.get(playerId);
  // Random jitter spreads meta-replans across AIs so they do not co-fire on
  // the same tick. AI_SPATIAL_FOCUS_EXPIRY_JITTER_MS is fixed; the actual
  // jitter per refresh is uniform in [0, jitter).
  const jitterMs = Math.floor(Math.random() * AI_SPATIAL_FOCUS_EXPIRY_JITTER_MS);
  const focus = selectSpatialFocus({
    prior,
    hotFrontierTileKeys,
    buildCandidateTileKeys,
    settlePendingTileKeys: frontierTileKeys,
    ownedTileKeys: territoryTileKeys,
    now,
    jitterMs,
    lastScanWasProductive: productiveByPlayer.get(playerId)
  });
  if (focus) {
    focusByPlayer.set(playerId, focus);
  } else {
    focusByPlayer.delete(playerId);
    productiveByPlayer.delete(playerId);
  }
  return focus;
};
