import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import {
  FORT_TIER_LADDER,
  SIEGE_TIER_LADDER,
  structureBuildGoldCost,
  structureBuildManpowerCost,
  structureCostDefinition,
  type BuildableStructureType
} from "@border-empires/shared";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";
import { completeStructureBuild } from "./runtime-structure-command-handlers.js";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";
import {
  completeStructureRemoval,
  handleCancelFortBuildCommand,
  handleCancelSiegeOutpostBuildCommand,
  handleCancelStructureBuildCommand
} from "./runtime-structure-lifecycle-command-handlers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

const PLAYER_ID = "player-1";

function makePlayer(overrides: Partial<DomainPlayer> = {}): DomainPlayer {
  return {
    id: PLAYER_ID,
    isAi: false,
    points: 0,
    manpower: 0,
    techIds: new Set(),
    allies: new Set(),
    ...overrides
  };
}

function makeTile(overrides: Partial<DomainTileState> = {}): DomainTileState {
  return {
    x: 5,
    y: 5,
    terrain: "LAND",
    ownerId: PLAYER_ID,
    ownershipState: "SETTLED",
    ...overrides
  };
}

function makeCommand(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    commandId: "cmd-1",
    playerId: PLAYER_ID,
    type: "CANCEL_STRUCTURE_BUILD",
    payloadJson: JSON.stringify({ x: 5, y: 5 }),
    ...overrides
  } as CommandEnvelope;
}

/** Builds a fake RuntimeStructureCommandContext backed by plain Maps so the cancel
 * handlers can be exercised without spinning up a full Runtime instance. */
function createContext(player: DomainPlayer, tile: DomainTileState) {
  const players = new Map<string, DomainPlayer>([[player.id, player]]);
  const tiles = new Map<string, DomainTileState>([[simulationTileKey(tile.x, tile.y), tile]]);
  const events: SimulationEvent[] = [];
  const scheduled: Array<{ delayMs: number; task: () => void }> = [];
  const ownedStructureCounts = new Map<string, Map<BuildableStructureType, number>>();
  let playerStateUpdates = 0;

  const context: RuntimeStructureCommandContext = {
    players,
    tiles,
    musterTilesByOwner: new Map(),
    locksByTile: new Map(),
    locksByCommandId: new Map(),
    now: () => 0,
    emitEvent: (event) => {
      events.push(event);
    },
    emitPlayerStateUpdate: () => {
      playerStateUpdates += 1;
    },
    scheduleAfter: (delayMs, callback) => {
      scheduled.push({ delayMs, task: callback });
    },
    applyManpowerRegen: () => {},
    playerManpowerCap: () => 100_000,
    rejectIfNoDevelopmentSlot: () => false,
    strategicResourceAmount: (p, resource) => p.strategicResources?.[resource] ?? 0,
    spendStrategicResource: (p, resource, amount) => {
      const current = p.strategicResources?.[resource] ?? 0;
      if (current < amount) return false;
      p.strategicResources = { ...(p.strategicResources ?? {}), [resource]: current - amount };
      return true;
    },
    ownedStructureCountForPlayer: (playerId, structureType) => ownedStructureCounts.get(playerId)?.get(structureType) ?? 0,
    supportedTownKeysForTile: () => [],
    supportedDockKeysForTile: () => [],
    economicStructureForSupportedTown: () => undefined,
    firstAvailableTownSupportTile: () => undefined,
    assignedTownKeyForSupportTile: () => undefined,
    replaceTileState: (tileKey, next) => {
      tiles.set(tileKey, next);
    },
    tileDeltaFromState: (t) => ({ x: t.x, y: t.y, ownerId: t.ownerId, ownershipState: t.ownershipState }),
    completeStructureBuild: (targetKey, ownerId, structureType, commandId) =>
      completeStructureBuild(context, targetKey, ownerId, structureType, commandId),
    completeStructureRemoval: (targetKey, ownerId, commandId) => completeStructureRemoval(context, targetKey, ownerId, commandId)
  };

  return {
    context,
    tiles,
    events,
    scheduled,
    ownedStructureCounts,
    playerStateUpdateCount: () => playerStateUpdates
  };
}

describe("handleCancelFortBuildCommand refunds", () => {
  it("refunds the exact FORT tier gold, manpower, and iron on cancel", () => {
    const player = makePlayer({ points: 100, manpower: 50 });
    const tile = makeTile({ fort: { ownerId: PLAYER_ID, status: "under_construction", variant: "FORT", completesAt: 5_000 } });
    const { context, tiles, playerStateUpdateCount } = createContext(player, tile);

    handleCancelFortBuildCommand(context, makeCommand({ type: "CANCEL_FORT_BUILD" }));

    const tier = FORT_TIER_LADDER.FORT;
    expect(player.points).toBe(100 + tier.gold);
    expect(player.manpower).toBe(50 + tier.manpower);
    expect(player.strategicResources?.IRON).toBe(tier.iron);
    expect(tiles.get(simulationTileKey(5, 5))?.fort).toBeUndefined();
    expect(playerStateUpdateCount()).toBe(1);
  });

  it("refunds the upgraded tier (not the base tier) when cancelling an IRON_BASTION build", () => {
    const player = makePlayer({ points: 0, manpower: 0 });
    const tile = makeTile({ fort: { ownerId: PLAYER_ID, status: "under_construction", variant: "IRON_BASTION", completesAt: 5_000 } });
    const { context } = createContext(player, tile);

    handleCancelFortBuildCommand(context, makeCommand({ type: "CANCEL_FORT_BUILD" }));

    const tier = FORT_TIER_LADDER.IRON_BASTION;
    expect(player.points).toBe(tier.gold);
    expect(player.manpower).toBe(tier.manpower);
    expect(player.strategicResources?.IRON).toBe(tier.iron);
  });

  it("does not refund when there is no fort under construction", () => {
    const player = makePlayer({ points: 10, manpower: 10 });
    const tile = makeTile();
    const { context, events } = createContext(player, tile);

    handleCancelFortBuildCommand(context, makeCommand({ type: "CANCEL_FORT_BUILD" }));

    expect(player.points).toBe(10);
    expect(player.manpower).toBe(10);
    expect(events.some((event) => event.eventType === "COMMAND_REJECTED")).toBe(true);
  });
});

describe("handleCancelSiegeOutpostBuildCommand refunds", () => {
  it("refunds gold, manpower, and supply for the stored siege tier", () => {
    const player = makePlayer({ points: 20, manpower: 5 });
    const tile = makeTile({
      siegeOutpost: { ownerId: PLAYER_ID, status: "under_construction", variant: "SIEGE_TOWER", completesAt: 5_000 }
    });
    const { context, tiles } = createContext(player, tile);

    handleCancelSiegeOutpostBuildCommand(context, makeCommand({ type: "CANCEL_SIEGE_OUTPOST_BUILD" }));

    const tier = SIEGE_TIER_LADDER.SIEGE_TOWER;
    expect(player.points).toBe(20 + tier.gold);
    expect(player.manpower).toBe(5 + tier.manpower);
    expect(player.strategicResources?.SUPPLY).toBe(tier.supply);
    expect(player.strategicResources?.IRON).toBe(tier.iron);
    expect(tiles.get(simulationTileKey(5, 5))?.siegeOutpost).toBeUndefined();
  });
});

describe("handleCancelStructureBuildCommand refunds", () => {
  it("refunds gold (accounting for the owned-count index already including this build), manpower, and strategic cost for an economic structure", () => {
    const player = makePlayer({ points: 500, manpower: 0 });
    const tile = makeTile({
      economicStructure: { ownerId: PLAYER_ID, type: "GRANARY", status: "under_construction", completesAt: 5_000 }
    });
    const { context, ownedStructureCounts, tiles } = createContext(player, tile);
    // The owned-structure index bumps as soon as construction starts, so by cancel
    // time it already counts this under-construction structure. Simulate a player who
    // already has one completed GRANARY plus this second (cancelled) one: index reads 2.
    ownedStructureCounts.set(PLAYER_ID, new Map([["GRANARY", 2]]));

    handleCancelStructureBuildCommand(context, makeCommand());

    const expectedGold = structureBuildGoldCost("GRANARY", 1); // existingCount - 1
    const expectedManpower = structureBuildManpowerCost("GRANARY");
    const costDef = structureCostDefinition("GRANARY");
    expect(player.points).toBe(500 + expectedGold);
    expect(player.manpower).toBe(expectedManpower);
    expect(player.strategicResources?.[costDef.resourceCost!.resource]).toBe(costDef.resourceCost!.amount);
    expect(tiles.get(simulationTileKey(5, 5))?.economicStructure).toBeUndefined();
  });

  it("refunds an OBSERVATORY build's gold/crystal cost on cancel", () => {
    const player = makePlayer({ points: 800, manpower: 0 });
    const tile = makeTile({ observatory: { ownerId: PLAYER_ID, status: "under_construction", completesAt: 5_000 } });
    const { context } = createContext(player, tile);

    handleCancelStructureBuildCommand(context, makeCommand());

    const costDef = structureCostDefinition("OBSERVATORY");
    expect(player.points).toBe(800 + structureBuildGoldCost("OBSERVATORY", 0));
    expect(player.strategicResources?.CRYSTAL).toBe(costDef.resourceCost!.amount);
  });

  it("does NOT refund when cancelling a structure removal in progress (removal was never paid for)", () => {
    const player = makePlayer({ points: 30, manpower: 0 });
    const tile = makeTile({
      economicStructure: {
        ownerId: PLAYER_ID,
        type: "MARKET",
        status: "removing",
        previousStatus: "active",
        completesAt: 5_000
      }
    });
    const { context, tiles } = createContext(player, tile);

    handleCancelStructureBuildCommand(context, makeCommand());

    expect(player.points).toBe(30);
    expect(player.manpower).toBe(0);
    const restored = tiles.get(simulationTileKey(5, 5))?.economicStructure;
    expect(restored?.status).toBe("active");
    expect(restored?.previousStatus).toBeUndefined();
  });

  it("leaves a stale scheduleAfter build-completion callback as a safe no-op after cancel", () => {
    const player = makePlayer({ points: 500, manpower: 0 });
    const tile = makeTile({
      economicStructure: { ownerId: PLAYER_ID, type: "GRANARY", status: "under_construction", completesAt: 5_000 }
    });
    const { context, tiles } = createContext(player, tile);

    // Simulate the original build having scheduled its completion callback, exactly
    // as handleBuildStructureCommand does via context.scheduleAfter(...).
    const staleCompletion = () => context.completeStructureBuild(simulationTileKey(5, 5), PLAYER_ID, "GRANARY", "build-cmd-1");

    handleCancelStructureBuildCommand(context, makeCommand());
    const goldAfterCancel = player.points;

    // The stale timer firing after cancellation must not resurrect the structure or
    // apply a second refund/charge.
    expect(() => staleCompletion()).not.toThrow();
    expect(tiles.get(simulationTileKey(5, 5))?.economicStructure).toBeUndefined();
    expect(player.points).toBe(goldAfterCancel);
  });
});
