import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";
import { handleCreateMountainCommand, type RuntimeMapCommandContext } from "./runtime-map-command-handlers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

const PLAYER_ID = "player-1";
const TARGET_KEY = simulationTileKey(5, 5);
const OBSERVATORY_KEY = simulationTileKey(4, 5);

function makePlayer(): DomainPlayer {
  return { id: PLAYER_ID, isAi: false, points: 0, manpower: 0, techIds: new Set(["terrain-engineering"]), allies: new Set() };
}

function makeTile(overrides: Partial<DomainTileState> = {}): DomainTileState {
  return { x: 5, y: 5, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED", ...overrides };
}

/** Builds a fake RuntimeMapCommandContext backed by plain Maps so handleCreateMountainCommand
 * can be exercised without spinning up a full Runtime instance. */
function createContext(player: DomainPlayer, tile: DomainTileState) {
  const tiles = new Map<string, DomainTileState>([[TARGET_KEY, tile]]);
  const events: SimulationEvent[] = [];

  const context: RuntimeMapCommandContext = {
    players: new Map([[player.id, player]]),
    tiles,
    now: () => 0,
    emitEvent: (event) => { events.push(event); },
    ownedLandWithinRange: () => true,
    pickReadyOwnedObservatoryForTarget: () => OBSERVATORY_KEY,
    stampObservatoryCooldown: () => {},
    spendStrategicResource: () => true,
    replaceTileState: (tileKey, next) => { tiles.set(tileKey, next); },
    tileDeltaFromState: (t) => ({ x: t.x, y: t.y }),
    bumpTerrainEpoch: () => {},
    isStructurePowered: () => true,
    isStructureDormant: () => false,
    isTileShieldedByEnemyAegisDome: () => false,
    isTileShieldedByAegisLock: () => false,
    isTileBombardBlockedByRadar: () => false,
    emitPlayerMessage: () => {},
    getAbilityCooldownUntil: () => 0,
    setAbilityCooldownUntil: () => {},
    strategicResourceAmount: () => 0,
    addStrategicResource: () => {},
    appendPlayerEventLogEntry: () => {}
  };

  return { context, tiles, events };
}

function makeCommand(): CommandEnvelope {
  return {
    commandId: "create-mountain-1",
    playerId: PLAYER_ID,
    type: "CREATE_MOUNTAIN",
    payloadJson: JSON.stringify({ x: 5, y: 5 })
  } as CommandEnvelope;
}

describe("handleCreateMountainCommand muster clearing", () => {
  it("clears a staged muster flag and broadcasts the clear when turning an owned tile into a mountain", () => {
    const player = makePlayer();
    const tile = makeTile({ muster: { ownerId: PLAYER_ID, amount: 50, mode: "HOLD", updatedAt: 0 } });
    const { context, tiles, events } = createContext(player, tile);

    handleCreateMountainCommand(context, makeCommand());

    const resolved = tiles.get(TARGET_KEY);
    expect(resolved?.terrain).toBe("MOUNTAIN");
    expect(resolved?.ownerId).toBeUndefined();
    expect(resolved?.muster).toBeUndefined();

    const broadcast = events.find(
      (event): event is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> =>
        event.eventType === "TILE_DELTA_BATCH" && event.commandId === "create-mountain-1:bc"
    );
    expect(broadcast?.tileDeltas).toEqual([{ x: 5, y: 5, ownerId: "", ownershipState: "", musterJson: "" }]);
  });

  it("does not broadcast a muster clear when the tile had no staged muster flag", () => {
    const player = makePlayer();
    const tile = makeTile();
    const { context, events } = createContext(player, tile);

    handleCreateMountainCommand(context, makeCommand());

    const broadcast = events.find(
      (event): event is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> =>
        event.eventType === "TILE_DELTA_BATCH" && event.commandId === "create-mountain-1:bc"
    );
    expect(broadcast).toBeUndefined();
  });
});
