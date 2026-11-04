import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import type { ConnectedTownNetworkEntry } from "../economy-network/economy-network.js";
import { createEmptyPlayerRuntimeSummary } from "../player-runtime-summary.js";
import type { RuntimePlayer } from "../runtime-types.js";
import { townEconomyViewForPlayer } from "./runtime-town-economy-view.js";
import type { RuntimeTownNetworkContext } from "./runtime-town-network.js";

const townTileFor = (playerId: string): DomainTileState => ({
  x: 4,
  y: 4,
  terrain: "LAND",
  ownerId: playerId,
  ownershipState: "SETTLED",
  town: { name: "Alpha", type: "FARMING", populationTier: "TOWN" }
});

// Each test uses its own player id: the module keeps a last-view-per-player map.
const context = (playerId = "ai-1"): RuntimeTownNetworkContext => {
  const townTile = townTileFor(playerId);
  const summary = createEmptyPlayerRuntimeSummary();
  summary.ownedTownTierByTile.set("4,4", "TOWN");
  return {
    tiles: new Map([["4,4", townTile]]),
    townNetworkCacheByPlayer: new Map(),
    townConnectivityStateByPlayer: new Map(),
    tileYieldContextCacheByPlayer: new Map(),
    players: new Map([[playerId, { id: playerId, isAi: true, techIds: new Set(), domainIds: new Set() } as unknown as RuntimePlayer]]),
    summaryForPlayer: () => summary,
    settledTilesForPlayer: () => [townTile],
    foodDormantTownKeysForPlayer: () => new Set(),
    dormantEconomicStructureKeysForPlayer: () => new Set()
  };
};

describe("townEconomyViewForPlayer", () => {
  it("builds the network on a cache miss, then reuses the view until the network is replaced", () => {
    const ctx = context();
    const first = townEconomyViewForPlayer(ctx, "ai-1");
    expect(first?.map((e) => e.townKey)).toEqual(["4,4"]);
    expect(ctx.townNetworkCacheByPlayer.has("ai-1")).toBe(true);
    expect(townEconomyViewForPlayer(ctx, "ai-1")).toBe(first);

    // Invalidation replaces the cached network object; the view follows.
    ctx.townNetworkCacheByPlayer.set("ai-1", new Map<string, ConnectedTownNetworkEntry>());
    const second = townEconomyViewForPlayer(ctx, "ai-1");
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it("never rebuilds the network when asked not to, and serves the player's last view instead", () => {
    const ctx = context("ai-2");
    expect(townEconomyViewForPlayer(ctx, "ai-2", { rebuildOnMiss: false })).toBeUndefined();
    expect(ctx.townNetworkCacheByPlayer.has("ai-2")).toBe(false);
    const built = townEconomyViewForPlayer(ctx, "ai-2");
    ctx.townNetworkCacheByPlayer.delete("ai-2");
    expect(townEconomyViewForPlayer(ctx, "ai-2", { rebuildOnMiss: false })).toBe(built);
    expect(ctx.townNetworkCacheByPlayer.has("ai-2")).toBe(false);
  });

  it("returns undefined for an unknown player", () => {
    expect(townEconomyViewForPlayer(context(), "nobody")).toBeUndefined();
  });
});
