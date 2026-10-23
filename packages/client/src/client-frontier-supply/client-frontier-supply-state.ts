import { reachCacheKey, resolveMyReachCached, type ReachCacheState } from "../client-reach-authoritative/client-reach-authoritative.js";
import { seaLaneSupplyLinksFor } from "../client-dock-landing/client-dock-landing.js";
import type { ActiveAetherBridgeView, DockPair } from "../client-types.js";
import { computeFrontierSupplyModel, EMPTY_FRONTIER_SUPPLY_MODEL, type FrontierSupplyModel } from "./client-frontier-supply.js";

/** The subset of ClientState the supply model reads. */
export type FrontierSupplyState = ReachCacheState & { activeAetherBridges: readonly ActiveAetherBridgeView[]; dockPairs: readonly DockPair[] };

type CacheEntry = { key: string; model: FrontierSupplyModel; computedAt: number };

/**
 * One entry per live ClientState object (in practice exactly one), so the
 * cache is bounded by construction and goes away with its state.
 */
const cache = new WeakMap<object, CacheEntry>();

/**
 * Tile changes arrive in bursts (a TILE_DELTA_BATCH per command), and each
 * bumps tilesRevision. The model is a whole-empire pass, so recompute at most
 * this often; in between, a slightly stale model is fine for a visual.
 */
const MIN_RECOMPUTE_GAP_MS = 250;

const bridgeLinksFor = (state: FrontierSupplyState, nowMs: number): Array<readonly [string, string]> =>
  state.activeAetherBridges
    .filter((bridge) => bridge.ownerId === state.me && bridge.endsAt > nowMs)
    .map((bridge) => [`${bridge.from.x},${bridge.from.y}`, `${bridge.to.x},${bridge.to.y}`] as const);

/**
 * The viewer's frontier supply model, memoised per state on the reach cache
 * key plus the viewer's live Aether bridges and dock sea lanes in use. Safe to call every frame from
 * both renderers. `wallNowMs` is epoch time (bridge expiry
 * is server epoch ms).
 */
export const frontierSupplyModelForState = (state: FrontierSupplyState, wallNowMs = Date.now()): FrontierSupplyModel => {
  if (!state.me) return EMPTY_FRONTIER_SUPPLY_MODEL;
  const cached = cache.get(state);
  // Inside the throttle window the cached model stands whatever changed, so skip building the key at all (this runs every frame).
  if (cached && wallNowMs - cached.computedAt < MIN_RECOMPUTE_GAP_MS) return cached.model;
  const extraLinks = bridgeLinksFor(state, wallNowMs);
  const seaLanes = seaLaneSupplyLinksFor(state);
  const key = `${state.me}|${reachCacheKey(state)}|${extraLinks.map(([a, b]) => `${a}>${b}`).join(";")}|${seaLanes.map((lane) => `${lane.dockKey}~${lane.landingKey}`).join(";")}`;
  if (cached?.key === key) { cached.computedAt = wallNowMs; return cached.model; }
  const model = computeFrontierSupplyModel({ tiles: state.tiles.values(), me: state.me, reach: resolveMyReachCached(state), extraLinks, seaLanes });
  cache.set(state, { key, model, computedAt: wallNowMs });
  return model;
};

