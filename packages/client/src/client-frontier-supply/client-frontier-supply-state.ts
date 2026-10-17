import { reachCacheKey, resolveMyReachCached, type ReachCacheState } from "../client-reach-authoritative/client-reach-authoritative.js";
import type { ActiveAetherBridgeView } from "../client-types.js";
import { computeFrontierSupplyModel, EMPTY_FRONTIER_SUPPLY_MODEL, type FrontierSupplyChokepoint, type FrontierSupplyModel } from "./client-frontier-supply.js";

/** The subset of ClientState the supply model reads. */
export type FrontierSupplyState = ReachCacheState & { activeAetherBridges: readonly ActiveAetherBridgeView[] };

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
 * key plus the viewer's live Aether bridges. Safe to call every frame from
 * both renderers and the tile menu. `wallNowMs` is epoch time (bridge expiry
 * is server epoch ms).
 */
export const frontierSupplyModelForState = (state: FrontierSupplyState, wallNowMs = Date.now()): FrontierSupplyModel => {
  if (!state.me) return EMPTY_FRONTIER_SUPPLY_MODEL;
  const extraLinks = bridgeLinksFor(state, wallNowMs);
  const key = `${state.me}|${reachCacheKey(state)}|${extraLinks.map(([a, b]) => `${a}>${b}`).join(";")}`;
  const cached = cache.get(state);
  if (cached && (cached.key === key || wallNowMs - cached.computedAt < MIN_RECOMPUTE_GAP_MS)) return cached.model;
  const model = computeFrontierSupplyModel({ tiles: state.tiles.values(), me: state.me, reach: resolveMyReachCached(state), extraLinks });
  cache.set(state, { key, model, computedAt: wallNowMs });
  return model;
};

/** A state that may or may not carry everything the supply model needs (e.g. the tile menu's narrow deps.state). */
export type PartialFrontierSupplyState = { me: string } & Partial<Omit<FrontierSupplyState, "me">>;

const isFrontierSupplyState = (state: PartialFrontierSupplyState): state is FrontierSupplyState =>
  state.tiles !== undefined &&
  typeof state.tilesRevision === "number" &&
  typeof state.serverReachRevision === "number" &&
  typeof state.myReachRevisionAtCompute === "string" &&
  state.activeAetherBridges !== undefined;

/** The chokepoint at `tile`, if the viewer's supply line runs through it; undefined when the state can't say. */
export const frontierSupplyChokepointForState = (
  state: PartialFrontierSupplyState,
  tile: { x: number; y: number }
): FrontierSupplyChokepoint | undefined =>
  isFrontierSupplyState(state) ? frontierSupplyModelForState(state).chokepoints.get(`${tile.x},${tile.y}`) : undefined;
