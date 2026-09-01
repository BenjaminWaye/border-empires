import { describe, expect, it } from "vitest";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { handleChooseDomainCommand, handleChooseTechCommand, handleCollectShardCommand, type RuntimeProgressionCommandContext } from "./runtime-progression-command-handlers.js";

const buildPlayer = (id: string, overrides: Partial<DomainPlayer> = {}): DomainPlayer => ({
  id,
  isAi: false,
  points: 100,
  manpower: 150,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  ...overrides
} as DomainPlayer);

const buildContext = (
  players: Map<string, DomainPlayer>,
  tiles: Map<string, DomainTileState>,
  resyncRevealedResourceTilesForPlayer: RuntimeProgressionCommandContext["resyncRevealedResourceTilesForPlayer"],
  overrides: Partial<RuntimeProgressionCommandContext> = {}
): RuntimeProgressionCommandContext => {
  const events: SimulationEvent[] = [];
  return {
    players,
    tiles,
    emitEvent: (event) => { events.push(event); },
    emitPlayerStateUpdate: () => {},
    addStrategicResource: () => {},
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
    replaceTileState: () => {},
    setTileState: () => {},
    invalidateTileStringifyCache: () => {},
    summaryForPlayer: () => ({ ownedTownTierByTile: new Map() } as never),
    invalidateEconomySnapshot: () => {},
    invalidateTileYieldContext: () => {},
    invalidateUpkeepAccrual: () => {},
    resyncVisionRadius: () => {},
    incomePerMinuteForPlayer: () => 0,
    decrementShardRainSiteCount: () => 0,
    clearShardRainExpiry: () => {},
    clearLastShardRainHello: () => {},
    onShardCollected: undefined,
    resourceSlotSupplyForPlayer: () => ({ FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }),
    resourceSlotDemandForPlayer: () => ({ FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }),
    invalidateResourceSlotDemand: () => {},
    resyncRevealedResourceTilesForPlayer,
    ...overrides
  };
};

// Regression coverage: completing a revealResource tech (e.g. crystal-lattices
// -> "Aetheric Resonance") used to only recompute vision radius, never
// re-sending tile data for tiles that were already inside the player's vision
// before the tech finished. Their resource field stayed stale/masked forever
// because no fresh delta ever went out for them. handleChooseTechCommand must
// call resyncRevealedResourceTilesForPlayer for any tech with a revealResource
// effect, so already-visible tiles get resent with the now-unmasked resource.
describe("handleChooseTechCommand resource-reveal resync", () => {
  it("resyncs already-visible tiles for a revealResource tech (crystal-lattices)", () => {
    const player = buildPlayer("player-1", { points: 100 });
    const players = new Map([["player-1", player]]);
    const tiles = new Map<string, DomainTileState>();
    const calls: Array<{ playerId: string; category: string }> = [];
    const context = buildContext(players, tiles, (playerId, category) => {
      calls.push({ playerId, category });
    });
    const command: CommandEnvelope = {
      commandId: "cmd-1",
      playerId: "player-1",
      commandType: "CHOOSE_TECH",
      payloadJson: JSON.stringify({ techId: "crystal-lattices" })
    } as CommandEnvelope;

    handleChooseTechCommand(context, command);

    expect(calls).toEqual([{ playerId: "player-1", category: "crystal" }]);
  });

  it("does not resync for a tech with no revealResource effect", () => {
    const player = buildPlayer("player-1", { points: 100 });
    const players = new Map([["player-1", player]]);
    const tiles = new Map<string, DomainTileState>();
    const calls: Array<{ playerId: string; category: string }> = [];
    const context = buildContext(players, tiles, (playerId, category) => {
      calls.push({ playerId, category });
    });
    const command: CommandEnvelope = {
      commandId: "cmd-2",
      playerId: "player-1",
      commandType: "CHOOSE_TECH",
      payloadJson: JSON.stringify({ techId: "agriculture" })
    } as CommandEnvelope;

    handleChooseTechCommand(context, command);

    expect(calls).toEqual([]);
  });
});

// Regression coverage: picking a domain (e.g. tier-1 Mercantile Charter,
// firstThreeTownsGoldOutputMult/firstThreeTownsPopulationGrowthMult) used to
// leave the per-player tile-yield economy context and economy snapshot
// caches stale — the multiplier only took effect once something unrelated
// happened to invalidate those caches later, so gold production and the
// town-overview modifiers panel didn't reflect the purchase right away.
// Both CHOOSE_DOMAIN and CHOOSE_TECH must invalidate them on every
// successful choice.
describe("cache invalidation on tech/domain choice", () => {
  it("invalidates the tile-yield and economy-snapshot caches on a successful domain choice", () => {
    const player = buildPlayer("player-1", { points: 100, techIds: new Set(["trade"]) });
    const players = new Map([["player-1", player]]);
    const tiles = new Map<string, DomainTileState>();
    const invalidatedEconomySnapshotFor: string[] = [];
    const invalidatedTileYieldContextFor: string[] = [];
    const context = buildContext(players, tiles, () => {}, {
      invalidateEconomySnapshot: (playerId) => { invalidatedEconomySnapshotFor.push(playerId); },
      invalidateTileYieldContext: (playerId) => { invalidatedTileYieldContextFor.push(playerId); }
    });
    const command: CommandEnvelope = {
      commandId: "cmd-domain-1",
      playerId: "player-1",
      commandType: "CHOOSE_DOMAIN",
      payloadJson: JSON.stringify({ domainId: "mercantile-charter" })
    } as CommandEnvelope;

    handleChooseDomainCommand(context, command);

    expect(player.domainIds?.has("mercantile-charter")).toBe(true);
    expect(invalidatedEconomySnapshotFor).toEqual(["player-1"]);
    expect(invalidatedTileYieldContextFor).toEqual(["player-1"]);
  });

  it("invalidates the tile-yield and economy-snapshot caches on a successful tech choice", () => {
    const player = buildPlayer("player-1", { points: 100 });
    const players = new Map([["player-1", player]]);
    const tiles = new Map<string, DomainTileState>();
    const invalidatedEconomySnapshotFor: string[] = [];
    const invalidatedTileYieldContextFor: string[] = [];
    const context = buildContext(players, tiles, () => {}, {
      invalidateEconomySnapshot: (playerId) => { invalidatedEconomySnapshotFor.push(playerId); },
      invalidateTileYieldContext: (playerId) => { invalidatedTileYieldContextFor.push(playerId); }
    });
    const command: CommandEnvelope = {
      commandId: "cmd-tech-1",
      playerId: "player-1",
      commandType: "CHOOSE_TECH",
      payloadJson: JSON.stringify({ techId: "agriculture" })
    } as CommandEnvelope;

    handleChooseTechCommand(context, command);

    expect(player.techIds.has("agriculture")).toBe(true);
    expect(invalidatedEconomySnapshotFor).toEqual(["player-1"]);
    expect(invalidatedTileYieldContextFor).toEqual(["player-1"]);
  });
});

// Regression coverage: collecting a shard credited the player's
// strategicResources ledger but never invalidated the cached economy
// snapshot, so the client-facing shard stock kept showing the pre-collect
// amount until something unrelated happened to bust the cache later.
describe("handleCollectShardCommand cache invalidation", () => {
  it("invalidates the economy-snapshot cache after crediting SHARD", () => {
    const player = buildPlayer("player-1", { points: 100 });
    const players = new Map([["player-1", player]]);
    const tiles = new Map<string, DomainTileState>([
      [
        "5,5",
        {
          x: 5,
          y: 5,
          ownerId: "player-1",
          ownershipState: "SETTLED",
          shardSite: { kind: "CACHE", amount: 3 }
        } as DomainTileState
      ]
    ]);
    const invalidatedEconomySnapshotFor: string[] = [];
    let credited = 0;
    const context = buildContext(players, tiles, () => {}, {
      addStrategicResource: (_player, resource, amount) => {
        if (resource === "SHARD") credited += amount;
      },
      invalidateEconomySnapshot: (playerId) => { invalidatedEconomySnapshotFor.push(playerId); }
    });
    const command: CommandEnvelope = {
      commandId: "cmd-shard-1",
      playerId: "player-1",
      commandType: "COLLECT_SHARD",
      payloadJson: JSON.stringify({ x: 5, y: 5 })
    } as CommandEnvelope;

    handleCollectShardCommand(context, command);

    expect(credited).toBe(3);
    expect(invalidatedEconomySnapshotFor).toEqual(["player-1"]);
  });
});
