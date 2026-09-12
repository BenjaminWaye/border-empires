import { describe, expect, it } from "vitest";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { handleChooseDomainCommand, handleChooseTechCommand, handleCollectShardCommand, handleUpgradeTownTierCommand, type RuntimeProgressionCommandContext } from "./runtime-progression-command-handlers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

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
    autoClaimFrontier: () => {},
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

// Regression coverage: capturing a town auto-claims its whole support ring
// as FRONTIER (the reach-anchor pipeline's autoClaimFrontier), but upgrading
// a CITY to GREAT_CITY -- which widens the support ring from radius 1 to 2 --
// went through setTileState instead of replaceTileState and so never ran
// that auto-claim for the newly-eligible ring-2 tiles. They stayed plain
// neutral ground until a player happened to EXPAND onto them. This asserts
// handleUpgradeTownTierCommand now calls autoClaimFrontier for exactly the
// new ring-2 tiles (chebyshev distance 2) and not the already-covered ring-1
// tiles or the town tile itself.
describe("handleUpgradeTownTierCommand support-ring auto-claim", () => {
  it("auto-claims only the newly-eligible ring-2 tiles on CITY -> GREAT_CITY", () => {
    const player = buildPlayer("player-1", { points: 1000 });
    const players = new Map([["player-1", player]]);
    // supportRingCandidates (the shared support-ring scan) only returns
    // candidates that actually exist in the tiles map -- matching the real
    // world, which is always fully dense (every coordinate has a tile
    // entry). Populate the surrounding 5x5 block as neutral LAND so the
    // ring-2 candidates are visible to it, same as production.
    const tiles = new Map<string, DomainTileState>();
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        tiles.set(simulationTileKey(10 + dx, 10 + dy), { x: 10 + dx, y: 10 + dy, terrain: "LAND" } as DomainTileState);
      }
    }
    tiles.set(simulationTileKey(10, 10), {
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      town: { type: "MARKET", populationTier: "CITY", population: 1_000_000 }
    } as DomainTileState);
    const autoClaimCalls: Array<{ tileKeys: readonly string[]; ownerId: string }> = [];
    const context = buildContext(players, tiles, () => {}, {
      resourceSlotSupplyForPlayer: () => ({ FOOD: 1, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }),
      resourceSlotDemandForPlayer: () => ({ FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }),
      autoClaimFrontier: (tileKeys, ownerId) => { autoClaimCalls.push({ tileKeys, ownerId }); }
    });
    const command: CommandEnvelope = {
      commandId: "cmd-upgrade-1",
      playerId: "player-1",
      commandType: "UPGRADE_TOWN_TIER",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    } as CommandEnvelope;

    handleUpgradeTownTierCommand(context, command);

    expect(autoClaimCalls).toHaveLength(1);
    expect(autoClaimCalls[0]?.ownerId).toBe("player-1");
    const claimedKeys = new Set(autoClaimCalls[0]?.tileKeys);
    // Ring-2 (chebyshev distance 2 from the town) tiles must be claimed.
    expect(claimedKeys.has(simulationTileKey(12, 10))).toBe(true);
    expect(claimedKeys.has(simulationTileKey(8, 8))).toBe(true);
    expect(claimedKeys.size).toBe(16); // 5x5 block minus the inner 3x3 (ring-1 + town tile)
    // The town tile itself and its ring-1 tiles must not be re-claimed here.
    expect(claimedKeys.has(simulationTileKey(10, 10))).toBe(false);
    expect(claimedKeys.has(simulationTileKey(11, 10))).toBe(false);
  });

  it("does not auto-claim on a tier step that doesn't widen the support ring", () => {
    const player = buildPlayer("player-1", { points: 1000 });
    const players = new Map([["player-1", player]]);
    const tiles = new Map<string, DomainTileState>([
      [
        simulationTileKey(10, 10),
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          town: { type: "MARKET", populationTier: "TOWN", population: 100_000 }
        } as DomainTileState
      ]
    ]);
    const autoClaimCalls: Array<{ tileKeys: readonly string[]; ownerId: string }> = [];
    const context = buildContext(players, tiles, () => {}, {
      resourceSlotSupplyForPlayer: () => ({ FOOD: 1, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }),
      resourceSlotDemandForPlayer: () => ({ FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }),
      autoClaimFrontier: (tileKeys, ownerId) => { autoClaimCalls.push({ tileKeys, ownerId }); }
    });
    const command: CommandEnvelope = {
      commandId: "cmd-upgrade-2",
      playerId: "player-1",
      commandType: "UPGRADE_TOWN_TIER",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    } as CommandEnvelope;

    handleUpgradeTownTierCommand(context, command);

    // TOWN -> CITY keeps the support ring at radius 1 (supportRingRadiusForTier),
    // so nothing new should be auto-claimed.
    expect(autoClaimCalls).toHaveLength(0);
  });
});
