import { describe, expect, it } from "vitest";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { handleChooseTechCommand, type RuntimeProgressionCommandContext } from "./runtime-progression-command-handlers.js";

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
  resyncRevealedResourceTilesForPlayer: RuntimeProgressionCommandContext["resyncRevealedResourceTilesForPlayer"]
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
    resyncRevealedResourceTilesForPlayer
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
