import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";
import { completeStructureBuild, handleBuildStructureCommand, type RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

function makePlayer(id: string, overrides: Partial<DomainPlayer> = {}): DomainPlayer {
  return {
    id,
    isAi: false,
    points: 0,
    manpower: 0,
    techIds: new Set(),
    allies: new Set(),
    ...overrides
  };
}

/** Minimal RuntimeStructureCommandContext stub — only wires the fields the
 * code paths under test actually touch (see runtime-structure-lifecycle-
 * command-handlers.test.ts for the same pattern; test files are excluded
 * from the tsconfig, so unused-by-this-path fields need not be present). */
function createContext(players: DomainPlayer[], tiles: DomainTileState[]) {
  const playerMap = new Map<string, DomainPlayer>(players.map((p) => [p.id, p]));
  const tileMap = new Map<string, DomainTileState>(tiles.map((t) => [simulationTileKey(t.x, t.y), t]));
  const events: SimulationEvent[] = [];
  const eventLogAppends: Array<{ playerId: string; type: string; text: string }> = [];

  const context = {
    players: playerMap,
    tiles: tileMap,
    musterTilesByOwner: new Map(),
    locksByTile: new Map(),
    locksByCommandId: new Map(),
    now: () => 1_000,
    emitEvent: (event: SimulationEvent) => {
      events.push(event);
    },
    emitPlayerStateUpdate: () => {},
    scheduleAfter: () => {},
    applyManpowerRegen: () => {},
    playerManpowerCap: () => 100_000,
    rejectIfNoDevelopmentSlot: () => false,
    strategicResourceAmount: (p: DomainPlayer, resource: string) => (p.strategicResources as Record<string, number> | undefined)?.[resource] ?? 0,
    spendStrategicResource: (p: DomainPlayer, resource: string, amount: number) => {
      const current = (p.strategicResources as Record<string, number> | undefined)?.[resource] ?? 0;
      if (current < amount) return false;
      p.strategicResources = { ...(p.strategicResources ?? {}), [resource]: current - amount };
      return true;
    },
    ownedStructureCountForPlayer: () => 0,
    isPlayerTileInReach: () => true,
    resourceSlotSupplyForPlayer: () => ({ FOOD: 99, TITANIUM: 99, CRYSTAL: 99, UMBRITE: 99 }),
    resourceSlotDemandForPlayer: () => ({ FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }),
    supportedTownKeysForTile: () => [],
    supportedDockKeysForTile: () => [],
    economicStructureForSupportedTown: () => undefined,
    firstAvailableTownSupportTile: () => undefined,
    assignedTownKeyForSupportTile: () => undefined,
    railDepotAlreadyInNetwork: () => false,
    replaceTileState: (tileKey: string, next: DomainTileState) => {
      tileMap.set(tileKey, next);
    },
    tileDeltaFromState: (t: DomainTileState) => ({ x: t.x, y: t.y, ownerId: t.ownerId, ownershipState: t.ownershipState }),
    completeStructureBuild: (targetKey: string, ownerId: string, structureType: string, commandId: string) =>
      completeStructureBuild(context, targetKey, ownerId, structureType, commandId),
    completeStructureRemoval: () => {},
    flushReachUpdates: () => {},
    appendPlayerEventLogEntry: (player: DomainPlayer, input: { type: string; text: string; occurredAt: number }) => {
      eventLogAppends.push({ playerId: player.id, type: input.type, text: input.text });
    }
  } as unknown as RuntimeStructureCommandContext;

  return { context, tiles: tileMap, events, eventLogAppends };
}

function makeCommand(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    commandId: "cmd-1",
    playerId: "player-2",
    type: "BUILD_STRUCTURE",
    payloadJson: JSON.stringify({ x: 5, y: 5, structureType: "IMPERIAL_EXCHANGE_PART_1" }),
    ...overrides
  } as CommandEnvelope;
}

// §16: exactly one Imperial Exchange/World Engine/Aegis Dome/Astral Dock may
// ever be completed globally in a season — once anyone's assembly is
// active, nobody else may build another part or assembly of that type, and
// a losing racer's sunk manpower is refunded rather than destroyed.
describe("§16 monument global uniqueness", () => {
  it("rejects a further IMPERIAL_EXCHANGE_PART_1 build once another player's Imperial Exchange is already active", () => {
    const rival = makePlayer("player-1");
    const actor = makePlayer("player-2", { manpower: 5_000, strategicResources: { CRYSTAL: 500 } });
    const { context, events } = createContext(
      [rival, actor],
      [
        { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructure: { ownerId: "player-1", type: "IMPERIAL_EXCHANGE", status: "active" } },
        {
          x: 5,
          y: 5,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          town: { type: "FARMING", populationTier: "TOWN" } as DomainTileState["town"]
        }
      ]
    );

    handleBuildStructureCommand(context, makeCommand());

    const rejection = events.find((e) => e.eventType === "COMMAND_REJECTED");
    expect(rejection).toMatchObject({ code: "MONUMENT_CLAIMED" });
  });

  it("does not block building a DIFFERENT monument's part once one type is claimed", () => {
    const rival = makePlayer("player-1");
    const actor = makePlayer("player-2", { manpower: 5_000, strategicResources: { CRYSTAL: 500 } });
    const { context, events } = createContext(
      [rival, actor],
      [
        { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructure: { ownerId: "player-1", type: "IMPERIAL_EXCHANGE", status: "active" } },
        { x: 5, y: 5, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "TOWN" } as DomainTileState["town"] }
      ]
    );

    handleBuildStructureCommand(context, makeCommand({ payloadJson: JSON.stringify({ x: 5, y: 5, structureType: "WORLD_ENGINE_PART_1" }) }));

    expect(events.some((e) => e.eventType === "COMMAND_REJECTED" && (e as { code?: string }).code === "MONUMENT_CLAIMED")).toBe(false);
  });

  it("refunds the losing racer's manpower and logs the outcome for winner and loser when the assembly completes", () => {
    const winner = makePlayer("winner", { manpower: 0 });
    const loser = makePlayer("loser", { manpower: 200, name: "Loser Co." });
    const bystander = makePlayer("bystander", { manpower: 50 });
    const { context, tiles, eventLogAppends } = createContext(
      [winner, loser, bystander],
      [
        {
          x: 1,
          y: 1,
          terrain: "LAND",
          ownerId: "winner",
          ownershipState: "SETTLED",
          economicStructure: { ownerId: "winner", type: "IMPERIAL_EXCHANGE", status: "under_construction", completesAt: 1_000 }
        },
        // The loser already completed one part before the winner finished —
        // this is the tile the manpower refund is keyed off.
        {
          x: 2,
          y: 2,
          terrain: "LAND",
          ownerId: "loser",
          ownershipState: "SETTLED",
          economicStructure: { ownerId: "loser", type: "IMPERIAL_EXCHANGE_PART_1", status: "active" }
        }
      ]
    );

    completeStructureBuild(context, simulationTileKey(1, 1), "winner", "IMPERIAL_EXCHANGE", "cmd-complete");

    expect(tiles.get(simulationTileKey(1, 1))?.economicStructure?.status).toBe("active");
    // 1,000 manpower — the IMPERIAL_EXCHANGE_PART_1 build cost (§16).
    expect(loser.manpower).toBe(1_200);
    expect(bystander.manpower).toBe(50);

    expect(eventLogAppends).toContainEqual(expect.objectContaining({ playerId: "winner", type: "MONUMENT_CLAIMED" }));
    expect(eventLogAppends).toContainEqual(expect.objectContaining({ playerId: "loser", type: "MONUMENT_LOST_TO_RIVAL" }));
    expect(eventLogAppends).toContainEqual(expect.objectContaining({ playerId: "bystander", type: "MONUMENT_CLAIMED" }));
  });

  it("does not activate a second assembly when two players' builds are both under_construction at once (completion-time race)", () => {
    // The reject gate in handleBuildStructureCommand only sees an already-
    // ACTIVE assembly, so two players can each have their own assembly
    // "under_construction" simultaneously if both submitted before either
    // finished. Whichever completeStructureBuild call loses that race must
    // not also go active.
    const winner = makePlayer("winner", { manpower: 0, points: 0 });
    const loser = makePlayer("loser", { manpower: 500, points: 0 });
    const { context, tiles, eventLogAppends } = createContext(
      [winner, loser],
      [
        {
          x: 1,
          y: 1,
          terrain: "LAND",
          ownerId: "winner",
          ownershipState: "SETTLED",
          economicStructure: { ownerId: "winner", type: "IMPERIAL_EXCHANGE", status: "under_construction", completesAt: 1_000 }
        },
        {
          x: 2,
          y: 2,
          terrain: "LAND",
          ownerId: "loser",
          ownershipState: "SETTLED",
          economicStructure: { ownerId: "loser", type: "IMPERIAL_EXCHANGE", status: "under_construction", completesAt: 1_000 }
        }
      ]
    );

    completeStructureBuild(context, simulationTileKey(1, 1), "winner", "IMPERIAL_EXCHANGE", "cmd-winner");
    completeStructureBuild(context, simulationTileKey(2, 2), "loser", "IMPERIAL_EXCHANGE", "cmd-loser");

    expect(tiles.get(simulationTileKey(1, 1))?.economicStructure).toMatchObject({ type: "IMPERIAL_EXCHANGE", status: "active", ownerId: "winner" });
    // The loser's tile is cleared, not left as a second active monument.
    expect(tiles.get(simulationTileKey(2, 2))?.economicStructure).toBeUndefined();
    // Refunded the assembly's own manpower cost (1,600, §16).
    expect(loser.manpower).toBe(2_100);
    expect(eventLogAppends).toContainEqual(expect.objectContaining({ playerId: "loser", type: "MONUMENT_LOST_TO_RIVAL" }));
  });

  // Tech-tree redesign: Population Bureau and Titanium Levy hook into the exact
  // same PART_TYPE_FOR_BASE/MONUMENTAL_STRUCTURE_TYPES generic mechanism as
  // the 4 pre-existing monuments -- no new uniqueness-enforcement code was
  // written for them, so this confirms the hookup actually works rather
  // than just compiling.
  it("rejects a further POPULATION_BUREAU_PART_1 build once another player's Population Bureau is already active", () => {
    const rival = makePlayer("player-1");
    const actor = makePlayer("player-2", { manpower: 5_000, strategicResources: { CRYSTAL: 500 } });
    const { context, events } = createContext(
      [rival, actor],
      [
        { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructure: { ownerId: "player-1", type: "POPULATION_BUREAU", status: "active" } },
        {
          x: 5,
          y: 5,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          town: { type: "FARMING", populationTier: "TOWN" } as DomainTileState["town"]
        }
      ]
    );

    handleBuildStructureCommand(context, makeCommand({ payloadJson: JSON.stringify({ x: 5, y: 5, structureType: "POPULATION_BUREAU_PART_1" }) }));

    const rejection = events.find((e) => e.eventType === "COMMAND_REJECTED");
    expect(rejection).toMatchObject({ code: "MONUMENT_CLAIMED" });
  });

  it("rejects a further TITANIUM_LEVY_PART_1 build once another player's Titanium Levy is already active", () => {
    const rival = makePlayer("player-1");
    const actor = makePlayer("player-2", { manpower: 5_000, strategicResources: { CRYSTAL: 500 } });
    const { context, events } = createContext(
      [rival, actor],
      [
        { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructure: { ownerId: "player-1", type: "TITANIUM_LEVY", status: "active" } },
        {
          x: 5,
          y: 5,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          town: { type: "FARMING", populationTier: "TOWN" } as DomainTileState["town"]
        }
      ]
    );

    handleBuildStructureCommand(context, makeCommand({ payloadJson: JSON.stringify({ x: 5, y: 5, structureType: "TITANIUM_LEVY_PART_1" }) }));

    const rejection = events.find((e) => e.eventType === "COMMAND_REJECTED");
    expect(rejection).toMatchObject({ code: "MONUMENT_CLAIMED" });
  });

  it("does not block Population Bureau once Titanium Levy is claimed (different monument types)", () => {
    const rival = makePlayer("player-1");
    const actor = makePlayer("player-2", { manpower: 5_000, strategicResources: { CRYSTAL: 500 } });
    const { context, events } = createContext(
      [rival, actor],
      [
        { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructure: { ownerId: "player-1", type: "TITANIUM_LEVY", status: "active" } },
        { x: 5, y: 5, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "TOWN" } as DomainTileState["town"] }
      ]
    );

    handleBuildStructureCommand(context, makeCommand({ payloadJson: JSON.stringify({ x: 5, y: 5, structureType: "POPULATION_BUREAU_PART_1" }) }));

    expect(events.some((e) => e.eventType === "COMMAND_REJECTED" && (e as { code?: string }).code === "MONUMENT_CLAIMED")).toBe(false);
  });
});

describe("completing a monument consumes its Parts", () => {
  it("clears all 3 owned Astral Dock Parts once the Astral Dock itself completes", () => {
    const actor = makePlayer("player-2", { manpower: 5_000, strategicResources: { CRYSTAL: 500, SHARD: 5 } });
    const { context, tiles } = createContext(
      [actor],
      [
        { x: 1, y: 1, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", economicStructure: { ownerId: "player-2", type: "ASTRAL_DOCK_PART_1", status: "active" } },
        { x: 2, y: 2, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", economicStructure: { ownerId: "player-2", type: "ASTRAL_DOCK_PART_2", status: "active" } },
        { x: 3, y: 3, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", economicStructure: { ownerId: "player-2", type: "ASTRAL_DOCK_PART_3", status: "active" } },
        {
          x: 5,
          y: 5,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          economicStructure: { ownerId: "player-2", type: "ASTRAL_DOCK", status: "under_construction", completesAt: 1_000 }
        }
      ]
    );

    completeStructureBuild(context, simulationTileKey(5, 5), "player-2", "ASTRAL_DOCK", "cmd-complete");

    expect(tiles.get(simulationTileKey(5, 5))?.economicStructure).toMatchObject({ type: "ASTRAL_DOCK", status: "active" });
    expect(tiles.get(simulationTileKey(1, 1))?.economicStructure).toBeUndefined();
    expect(tiles.get(simulationTileKey(2, 2))?.economicStructure).toBeUndefined();
    expect(tiles.get(simulationTileKey(3, 3))?.economicStructure).toBeUndefined();
  });

  it("does not touch another player's Parts of the same monument type", () => {
    const actor = makePlayer("player-2", { manpower: 5_000, strategicResources: { CRYSTAL: 500, SHARD: 5 } });
    const rival = makePlayer("player-1", { manpower: 5_000, strategicResources: { CRYSTAL: 500 } });
    const { context, tiles } = createContext(
      [actor, rival],
      [
        { x: 1, y: 1, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", economicStructure: { ownerId: "player-2", type: "TITANIUM_LEVY_PART_1", status: "active" } },
        { x: 9, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructure: { ownerId: "player-1", type: "TITANIUM_LEVY_PART_1", status: "active" } },
        {
          x: 5,
          y: 5,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          economicStructure: { ownerId: "player-2", type: "TITANIUM_LEVY", status: "under_construction", completesAt: 1_000 }
        }
      ]
    );

    completeStructureBuild(context, simulationTileKey(5, 5), "player-2", "TITANIUM_LEVY", "cmd-complete");

    expect(tiles.get(simulationTileKey(1, 1))?.economicStructure).toBeUndefined();
    expect(tiles.get(simulationTileKey(9, 9))?.economicStructure).toMatchObject({ type: "TITANIUM_LEVY_PART_1" });
  });
});
