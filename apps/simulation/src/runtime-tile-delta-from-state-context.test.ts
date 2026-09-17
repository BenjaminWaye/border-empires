import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { tileDeltaFromState, type TileDeltaFromStateDeps } from "./runtime-tile-delta-from-state.js";
import { TileDeltaStringifyCache } from "./tile-delta-stringify-cache/tile-delta-stringify-cache.js";
import type { RuntimePlayer, RuntimeTileYieldEconomyContext } from "./runtime-types.js";

// Regression for the 2026-09-17 prod CPU-throttle incident: every owned-tile
// delta resolved the owner's per-player tile-yield economy context, even
// though only town tiles and economic-structure tiles read anything from it.
// A settlement resolution emits exactly one delta for a plain tile right
// after the mutation that invalidated that context, so each settle paid a
// full town-network rebuild (13% of sim-worker CPU for a 125-town empire).
const player: RuntimePlayer = {
  id: "player-1",
  isAi: false,
  points: 0,
  manpower: 0,
  techIds: new Set(),
  domainIds: new Set(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set()
};

const makeDeps = (onContextResolve: () => void): TileDeltaFromStateDeps => ({
  players: new Map([[player.id, player]]),
  tileDeltaStringifyCache: new TileDeltaStringifyCache(),
  now: () => 0,
  tileYieldCollectedAt: () => undefined,
  tileYieldEconomyContextForPlayer: () => {
    onContextResolve();
    return {
      player,
      townNetwork: new Map(),
      fedTownKeys: new Set(),
      firstThreeTownKeys: new Set(),
      waterworksKeys: new Set(),
      foundryKeys: new Set(),
      dormantEconomicStructureKeys: new Set()
    } satisfies RuntimeTileYieldEconomyContext;
  },
  enrichTileWithTownContext: (tile) => tile,
  yieldViewEconomyContext: (p) => (p ? { player: p } : undefined),
  reachBorderOwnerAt: () => undefined
});

const plainTile: DomainTileState = { x: 10, y: 10, terrain: "LAND", ownerId: player.id, ownershipState: "SETTLED" };

describe("tileDeltaFromState — economy context resolution", () => {
  it("does not resolve the owner's economy context for a plain owned tile", () => {
    let resolves = 0;
    const delta = tileDeltaFromState(makeDeps(() => { resolves += 1; }), plainTile);
    expect(delta.ownerId).toBe(player.id);
    expect(resolves).toBe(0);
  });

  it("still resolves it for a town tile and for an economic-structure tile", () => {
    let resolves = 0;
    const deps = makeDeps(() => { resolves += 1; });
    tileDeltaFromState(deps, { ...plainTile, town: { type: "MARKET", populationTier: "TOWN", population: 1000, maxPopulation: 25_000 } });
    expect(resolves).toBe(1);
    tileDeltaFromState(deps, { ...plainTile, x: 11, resource: "FARM", economicStructure: { ownerId: player.id, type: "FARMSTEAD", status: "active" } });
    expect(resolves).toBe(2);
  });

  it("uses a caller-supplied context for the same owner without resolving", () => {
    let resolves = 0;
    const deps = makeDeps(() => { resolves += 1; });
    const context = deps.tileYieldEconomyContextForPlayer(player);
    resolves = 0;
    tileDeltaFromState(deps, { ...plainTile, town: { type: "MARKET", populationTier: "TOWN", population: 1000, maxPopulation: 25_000 } }, context);
    expect(resolves).toBe(0);
  });
});
