/**
 * Bench: resolvePlayerTiles cold (cache miss) and warm (cache hit).
 * Threshold: post < 0.7x pre (single-pass vs map/filter chains)
 *            warm < 0.05x pre (cache hit is very cheap)
 */
import { bench, describe } from "vitest";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";
import { resolvePlayerTiles } from "./planner-tile-resolver.js";

const N_OWNED = 800;
const N_FRONTIER = 200;
const N_HOT_FRONTIER = 50;
const N_STRATEGIC = 30;
const N_BUILD = 40;

const tilesByKey = new Map<string, PlannerTileView>();
const makeKeys = (prefix: string, n: number): string[] => {
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const key = `${prefix}${i},0`;
    tilesByKey.set(key, { x: i, y: 0, terrain: "LAND" });
    keys.push(key);
  }
  return keys;
};

const territoryTileKeys = makeKeys("o", N_OWNED);
const frontierTileKeys = makeKeys("f", N_FRONTIER);
const hotFrontierTileKeys = makeKeys("h", N_HOT_FRONTIER);
const strategicFrontierTileKeys = makeKeys("s", N_STRATEGIC);
const buildCandidateTileKeys = makeKeys("b", N_BUILD);

const player: PlannerPlayerView = {
  id: "p1",
  points: 1000,
  manpower: 1000,
  hasActiveLock: false,
  tileCollectionVersion: 1,
  topologyVersion: 1,
  topologyDirtyTileKeys: [],
  activeDevelopmentProcessCount: 0,
  territoryTileKeys,
  frontierTileKeys,
  hotFrontierTileKeys,
  strategicFrontierTileKeys,
  buildCandidateTileKeys,
  pendingSettlementTileKeys: [],
  townTileKeys: [],
  ownedTileCount: N_OWNED,
  frontierTileCount: N_FRONTIER
};

describe("resolvePlayerTiles", () => {
  bench("cold (cache miss every time, unique version each call)", () => {
    const cache = new Map();
    let version = 0;
    resolvePlayerTiles({ ...player, tileCollectionVersion: ++version }, tilesByKey, cache);
  });

  bench("warm (cache hit)", () => {
    const cache = new Map();
    // Pre-populate
    resolvePlayerTiles(player, tilesByKey, cache);
    // Measure warm hit
    resolvePlayerTiles(player, tilesByKey, cache);
  });
});
