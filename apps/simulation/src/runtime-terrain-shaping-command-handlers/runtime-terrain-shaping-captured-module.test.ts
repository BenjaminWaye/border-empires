import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";
import { handleCreateMountainCommand, type RuntimeMapCommandContext } from "../runtime-map-command-handlers.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

// Regression: a captured AFC's Geoform Engine Module let its captor build with
// it but not cast Create Mountain -- the cast gate read research only. An
// installed module (researched or captured) now casts its abilities too.

const PLAYER_ID = "player-1";
const TARGET_KEY = simulationTileKey(5, 5);
const AFC_KEY = simulationTileKey(1, 1);

const player = (): DomainPlayer => ({ id: PLAYER_ID, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() });

const afcTile = (modules: string[], afcOwner = PLAYER_ID): DomainTileState => ({
  x: 1, y: 1, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED",
  afc: { ownerId: afcOwner, status: "active", activatedAt: 0, capturedAt: 0, modules, houseModules: [], capturedModuleHouses: Object.fromEntries(modules.map((id) => [id, "player-2"])) }
} as DomainTileState);

function cast(afc: DomainTileState, ownedAfcTileKeys?: (playerId: string) => Iterable<string>) {
  const tiles = new Map<string, DomainTileState>([
    [TARGET_KEY, { x: 5, y: 5, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED" }],
    [AFC_KEY, afc]
  ]);
  const events: SimulationEvent[] = [];
  const context: RuntimeMapCommandContext = {
    players: new Map([[PLAYER_ID, player()]]),
    tiles,
    ...(ownedAfcTileKeys ? { ownedAfcTileKeys } : {}),
    now: () => 0,
    emitEvent: (event) => { events.push(event); },
    ownedLandWithinRange: () => true,
    pickReadyOwnedObservatoryForTarget: () => simulationTileKey(4, 5),
    spendObservatoryShot: () => {},
    spendStrategicResource: () => true,
    replaceTileState: (tileKey, next) => { tiles.set(tileKey, next); },
    applyEncirclement: () => {},
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
  handleCreateMountainCommand(context, { commandId: "cm-1", playerId: PLAYER_ID, type: "CREATE_MOUNTAIN", payloadJson: JSON.stringify({ x: 5, y: 5 }) } as CommandEnvelope);
  const rejected = events.some((event) => event.eventType === "COMMAND_REJECTED");
  return { terrain: tiles.get(TARGET_KEY)?.terrain, rejected };
}

describe("casting from a captured AFC module", () => {
  it("casts Create Mountain with a captured Geoform Engine Module and no research", () => {
    expect(cast(afcTile(["terrain-engineering"]))).toEqual({ terrain: "MOUNTAIN", rejected: false });
  });

  it("uses the player's AFC tile keys when the context provides them", () => {
    expect(cast(afcTile(["terrain-engineering"]), () => [AFC_KEY])).toEqual({ terrain: "MOUNTAIN", rejected: false });
  });

  it("still rejects without the module installed", () => {
    expect(cast(afcTile(["masonry"]))).toEqual({ terrain: "LAND", rejected: true });
  });

  it("rejects when the AFC on the tile belongs to another House", () => {
    expect(cast(afcTile(["terrain-engineering"], "player-2"))).toEqual({ terrain: "LAND", rejected: true });
  });
});
