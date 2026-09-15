import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { WAYSTATION_POP_BURST, WAYSTATION_RESOURCE_SLOT_BONUS, WAYSTATION_TECH_GRANT_ID } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { activateWaystationAt, seedWaystationVisionBonus, type WaystationActivationInput } from "./runtime-waystation-activation.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";

const PLAYER_ID = "player-1";
const WAYSTATION_KEY = "10,10";
const TOWN_KEY = "9,10";
const FAR_TOWN_KEY = "400,400";

function makePlayer(): DomainPlayer {
  return { id: PLAYER_ID, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() };
}

function createInput(tiles: Map<string, DomainTileState>, players: Map<string, DomainPlayer>): { input: WaystationActivationInput; events: SimulationEvent[]; reveals: Array<{ playerId: string; x: number; y: number; radius: number }> } {
  const events: SimulationEvent[] = [];
  const reveals: Array<{ playerId: string; x: number; y: number; radius: number }> = [];
  const input: WaystationActivationInput = {
    now: () => 0,
    tiles,
    players,
    visibilityCoverage: {
      addTileVisionBonus: (playerId, x, y, radius) => { reveals.push({ playerId, x, y, radius }); }
    },
    visionTransitionCallbacks: {},
    replaceTileState: (tileKey, tile) => { tiles.set(tileKey, tile); },
    emitEvent: (event) => { events.push(event); },
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y, ownerId: tile.ownerId, ownershipState: tile.ownershipState } as SimulationTileWireDelta)
  };
  return { input, events, reveals };
}

describe("activateWaystationAt", () => {
  it("grants all four permanent effects exactly once on first activation", () => {
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, { x: 10, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "FRONTIER", waystation: { activated: false } }],
      [TOWN_KEY, { x: 9, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", population: 1000, maxPopulation: 5000 } }]
    ]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input, events, reveals } = createInput(tiles, players);

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-1");

    // Effect 0: tile flips to activated.
    expect(tiles.get(WAYSTATION_KEY)?.waystation).toEqual({ activated: true, activatedByPlayerId: PLAYER_ID });

    // Effect 1: permanent vision reveal (addTileVisionBonus called, never removed -- this effect is permanent).
    expect(reveals).toHaveLength(1);
    expect(reveals[0]).toMatchObject({ playerId: PLAYER_ID, x: 10, y: 10 });

    // Effect 2: population burst to the nearest owned town.
    const town = tiles.get(TOWN_KEY)?.town;
    expect(town?.population).toBe(1000 + WAYSTATION_POP_BURST);
    expect(town?.maxPopulation).toBe(5000 + WAYSTATION_POP_BURST);

    // Effect 3: tech grant.
    const player = players.get(PLAYER_ID)!;
    expect(player.techIds.has(WAYSTATION_TECH_GRANT_ID)).toBe(true);

    // Effect 4: pooled resource-slot bump.
    expect(player.waystationResourceSlotBonus).toEqual({
      FOOD: WAYSTATION_RESOURCE_SLOT_BONUS,
      TITANIUM: WAYSTATION_RESOURCE_SLOT_BONUS,
      CRYSTAL: WAYSTATION_RESOURCE_SLOT_BONUS,
      UMBRITE: WAYSTATION_RESOURCE_SLOT_BONUS
    });

    // Each effect emitted its own TILE_DELTA_BATCH exactly once (waystation tile + town tile).
    const batches = events.filter((e): e is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> => e.eventType === "TILE_DELTA_BATCH");
    expect(batches).toHaveLength(2);
  });

  it("re-activation on an already-activated waystation is a no-op", () => {
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, { x: 10, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "FRONTIER", waystation: { activated: true, activatedByPlayerId: PLAYER_ID } }],
      [TOWN_KEY, { x: 9, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", population: 1000, maxPopulation: 5000 } }]
    ]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input, events, reveals } = createInput(tiles, players);

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-2");

    expect(events).toHaveLength(0);
    expect(reveals).toHaveLength(0);
    expect(tiles.get(TOWN_KEY)?.town?.population).toBe(1000);
    expect(players.get(PLAYER_ID)!.techIds.size).toBe(0);
    expect(players.get(PLAYER_ID)!.waystationResourceSlotBonus).toBeUndefined();
  });

  it("no-op when the tile has no waystation", () => {
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, { x: 10, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "FRONTIER" }]
    ]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input, events, reveals } = createInput(tiles, players);

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-3");

    expect(events).toHaveLength(0);
    expect(reveals).toHaveLength(0);
  });

  it("stacks the resource-slot bonus across two different waystation activations", () => {
    const secondKey = "20,20";
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, { x: 10, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "FRONTIER", waystation: { activated: false } }],
      [secondKey, { x: 20, y: 20, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "FRONTIER", waystation: { activated: false } }]
    ]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input } = createInput(tiles, players);

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-4");
    activateWaystationAt(input, secondKey, 20, 20, PLAYER_ID, "cmd-5");

    expect(players.get(PLAYER_ID)!.waystationResourceSlotBonus).toEqual({
      FOOD: WAYSTATION_RESOURCE_SLOT_BONUS * 2,
      TITANIUM: WAYSTATION_RESOURCE_SLOT_BONUS * 2,
      CRYSTAL: WAYSTATION_RESOURCE_SLOT_BONUS * 2,
      UMBRITE: WAYSTATION_RESOURCE_SLOT_BONUS * 2
    });
  });

  it("grants the vision/tech/resource-slot effects even with no owned town nearby (population burst is silently skipped)", () => {
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, { x: 10, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "FRONTIER", waystation: { activated: false } }],
      [FAR_TOWN_KEY, { x: 400, y: 400, terrain: "LAND", ownerId: "someone-else", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", population: 1000, maxPopulation: 5000 } }]
    ]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input, reveals } = createInput(tiles, players);

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-6");

    expect(reveals).toHaveLength(1);
    expect(players.get(PLAYER_ID)!.techIds.has(WAYSTATION_TECH_GRANT_ID)).toBe(true);
    expect(players.get(PLAYER_ID)!.waystationResourceSlotBonus).toBeDefined();
    // Not owned by us, so untouched.
    expect(tiles.get(FAR_TOWN_KEY)?.town?.population).toBe(1000);
  });

  it("emits a TECH_UPDATE event so an already-connected client's tech list updates immediately", () => {
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, { x: 10, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "FRONTIER", waystation: { activated: false } }]
    ]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input, events } = createInput(tiles, players);

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-7");

    const techUpdates = events.filter((e): e is Extract<SimulationEvent, { eventType: "TECH_UPDATE" }> => e.eventType === "TECH_UPDATE");
    expect(techUpdates).toHaveLength(1);
    expect(techUpdates[0]?.playerId).toBe(PLAYER_ID);
  });

  it("does not activate (and burns no permanent effect) when the player record is missing", () => {
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, { x: 10, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "FRONTIER", waystation: { activated: false } }]
    ]);
    const players = new Map<string, DomainPlayer>();
    const { input, events, reveals } = createInput(tiles, players);

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-8");

    expect(tiles.get(WAYSTATION_KEY)?.waystation).toEqual({ activated: false });
    expect(events).toHaveLength(0);
    expect(reveals).toHaveLength(0);
  });
});

describe("seedWaystationVisionBonus", () => {
  it("re-applies the permanent vision bonus for an already-activated waystation tile", () => {
    const calls: Array<{ playerId: string; x: number; y: number; radius: number }> = [];
    const coverage = { addTileVisionBonus: (playerId: string, x: number, y: number, radius: number) => { calls.push({ playerId, x, y, radius }); } };

    seedWaystationVisionBonus(coverage, {}, { x: 10, y: 10, waystation: { activated: true, activatedByPlayerId: PLAYER_ID } });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ playerId: PLAYER_ID, x: 10, y: 10 });
  });

  it("is a no-op for a dormant or absent waystation", () => {
    const calls: unknown[] = [];
    const coverage = { addTileVisionBonus: () => { calls.push(undefined); } };

    seedWaystationVisionBonus(coverage, {}, { x: 10, y: 10, waystation: { activated: false } });
    seedWaystationVisionBonus(coverage, {}, { x: 10, y: 10 });

    expect(calls).toHaveLength(0);
  });
});
