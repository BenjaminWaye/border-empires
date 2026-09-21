import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { WAYSTATION_POP_BURST, WAYSTATION_RESOURCE_SLOT_BONUS } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { activateWaystationAt, seedWaystationVisionBonus, type WaystationActivationInput } from "./runtime-waystation-activation.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";

const PLAYER_ID = "player-1";
const WAYSTATION_KEY = "10,10";
const TOWN_KEY = "9,10";
const FAR_TOWN_KEY = "400,400";

// Effect roll order in runtime-waystation-activation.ts: 0=VISION, 1=POPULATION, 2=TECH, 3=RESOURCE_SLOT.
const RANDOM_FOR = { VISION: 0.1, POPULATION: 0.3, TECH: 0.6, RESOURCE_SLOT: 0.9 };

/** A queue-based random stub: returns each value in order, then repeats the last value forever (so a test doesn't need to know exactly how many times `random()` is called). */
function queueRandom(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

function makePlayer(overrides: Partial<DomainPlayer> = {}): DomainPlayer {
  return { id: PLAYER_ID, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set(), ...overrides };
}

function createInput(
  tiles: Map<string, DomainTileState>,
  players: Map<string, DomainPlayer>,
  random?: () => number,
  alreadyVisibleTileKeys: ReadonlySet<string> = new Set()
): { input: WaystationActivationInput; events: SimulationEvent[]; reveals: Array<{ playerId: string; x: number; y: number; radius: number }> } {
  const events: SimulationEvent[] = [];
  const reveals: Array<{ playerId: string; x: number; y: number; radius: number }> = [];
  const input: WaystationActivationInput = {
    now: () => 0,
    tiles,
    players,
    visibilityCoverage: {
      addTileVisionBonus: (playerId, x, y, radius) => { reveals.push({ playerId, x, y, radius }); },
      isVisible: (_viewerId, tileKey) => alreadyVisibleTileKeys.has(tileKey)
    },
    visionTransitionCallbacks: {},
    replaceTileState: (tileKey, tile) => { tiles.set(tileKey, tile); },
    emitEvent: (event) => { events.push(event); },
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y, ownerId: tile.ownerId, ownershipState: tile.ownershipState } as SimulationTileWireDelta),
    ...(random ? { random } : {})
  };
  return { input, events, reveals };
}

const waystationTile = (overrides: Partial<DomainTileState> = {}): DomainTileState => ({
  x: 10, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "FRONTIER", waystation: { activated: false }, ...overrides
});

const townTile = (x: number, y: number, ownerId: string | undefined, population = 1000, maxPopulation = 5000, name?: string): DomainTileState => ({
  x, y, terrain: "LAND", ownerId, ownershipState: ownerId ? "SETTLED" : undefined,
  town: { type: "MARKET", populationTier: "TOWN", population, maxPopulation, ...(name ? { name } : {}) }
});

describe("activateWaystationAt", () => {
  it("re-activation on an already-activated waystation is a no-op", () => {
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, waystationTile({ waystation: { activated: true, activatedByPlayerId: PLAYER_ID, grantedEffect: "VISION" } })]
    ]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input, events, reveals } = createInput(tiles, players);

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-2");

    expect(events).toHaveLength(0);
    expect(reveals).toHaveLength(0);
  });

  it("no-op when the tile has no waystation", () => {
    const tiles = new Map<string, DomainTileState>([[WAYSTATION_KEY, { x: 10, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "FRONTIER" }]]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input, events, reveals } = createInput(tiles, players);

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-3");

    expect(events).toHaveLength(0);
    expect(reveals).toHaveLength(0);
  });

  it("does not activate (and burns no permanent effect) when the player record is missing", () => {
    const tiles = new Map<string, DomainTileState>([[WAYSTATION_KEY, waystationTile()]]);
    const players = new Map<string, DomainPlayer>();
    const { input, events, reveals } = createInput(tiles, players);

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-8");

    expect(tiles.get(WAYSTATION_KEY)?.waystation).toEqual({ activated: false });
    expect(events).toHaveLength(0);
    expect(reveals).toHaveLength(0);
  });

  it("picks exactly one effect (VISION) via the injected random and flips the tile permanently", () => {
    const tiles = new Map<string, DomainTileState>([[WAYSTATION_KEY, waystationTile()]]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input, events, reveals } = createInput(tiles, players, queueRandom([RANDOM_FOR.VISION]));

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-1");

    const waystation = tiles.get(WAYSTATION_KEY)?.waystation;
    expect(waystation?.activated).toBe(true);
    expect(waystation?.activatedByPlayerId).toBe(PLAYER_ID);
    expect(waystation?.grantedEffect).toBe("VISION");
    // Only VISION's own effect fired -- no tech grant, no resource bump, no population burst applied.
    expect(players.get(PLAYER_ID)!.techIds.size).toBe(0);
    expect(players.get(PLAYER_ID)!.waystationResourceSlotBonus).toBeUndefined();
    expect(reveals).toHaveLength(1);
    const batches = events.filter((e): e is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> => e.eventType === "TILE_DELTA_BATCH");
    expect(batches).toHaveLength(1);
  });

  it("VISION effect reveals around the nearest town (any owner) within range, not the waystation's own tile", () => {
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, waystationTile()],
      [TOWN_KEY, townTile(9, 10, "someone-else")]
    ]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input, reveals } = createInput(tiles, players, queueRandom([RANDOM_FOR.VISION]));

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-vision-town");

    expect(reveals).toHaveLength(1);
    expect(reveals[0]).toMatchObject({ playerId: PLAYER_ID, x: 9, y: 10 });
    const waystation = tiles.get(WAYSTATION_KEY)?.waystation;
    expect(waystation?.revealedAtX).toBe(9);
    expect(waystation?.revealedAtY).toBe(10);
  });

  it("VISION effect falls back to revealing the waystation's own tile when no town is within range", () => {
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, waystationTile()],
      [FAR_TOWN_KEY, townTile(400, 400, "someone-else")]
    ]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input, reveals } = createInput(tiles, players, queueRandom([RANDOM_FOR.VISION]));

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-vision-fallback");

    expect(reveals).toHaveLength(1);
    expect(reveals[0]).toMatchObject({ playerId: PLAYER_ID, x: 10, y: 10 });
    const waystation = tiles.get(WAYSTATION_KEY)?.waystation;
    expect(waystation?.revealedAtX).toBe(10);
    expect(waystation?.revealedAtY).toBe(10);
  });

  // Regression for: the VISION effect used to pick the nearest town within
  // range regardless of whether the activating player could already see it
  // (e.g. their own settled town, or one already under a structure/ally
  // vision bonus) -- "revealing" ground the player already has eyes on is no
  // scouting reward at all. It must now skip an already-visible town in favor
  // of the next-nearest one the player hasn't seen yet.
  it("VISION effect skips a nearer town the player already has vision of, in favor of the next-nearest not-yet-visible one", () => {
    const farTownKey = "12,10";
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, waystationTile()],
      [TOWN_KEY, townTile(9, 10, "someone-else")],
      [farTownKey, townTile(12, 10, "someone-else")]
    ]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input, reveals } = createInput(tiles, players, queueRandom([RANDOM_FOR.VISION]), new Set([TOWN_KEY]));

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-vision-skip-visible");

    expect(reveals).toHaveLength(1);
    expect(reveals[0]).toMatchObject({ playerId: PLAYER_ID, x: 12, y: 10 });
    const waystation = tiles.get(WAYSTATION_KEY)?.waystation;
    expect(waystation?.revealedAtX).toBe(12);
    expect(waystation?.revealedAtY).toBe(10);
  });

  it("VISION effect falls back to the waystation's own tile when every town within range is already visible", () => {
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, waystationTile()],
      [TOWN_KEY, townTile(9, 10, "someone-else")]
    ]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input, reveals } = createInput(tiles, players, queueRandom([RANDOM_FOR.VISION]), new Set([TOWN_KEY]));

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-vision-all-visible");

    expect(reveals).toHaveLength(1);
    expect(reveals[0]).toMatchObject({ playerId: PLAYER_ID, x: 10, y: 10 });
    const waystation = tiles.get(WAYSTATION_KEY)?.waystation;
    expect(waystation?.revealedAtX).toBe(10);
    expect(waystation?.revealedAtY).toBe(10);
  });

  it("POPULATION effect grants a burst to the nearest owned town when selected, and records its name on the waystation tile", () => {
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, waystationTile()],
      [TOWN_KEY, townTile(9, 10, PLAYER_ID, 1000, 5000, "Rivergate")]
    ]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input } = createInput(tiles, players, queueRandom([RANDOM_FOR.POPULATION]));

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-pop");

    const town = tiles.get(TOWN_KEY)?.town;
    expect(town?.population).toBe(1000 + WAYSTATION_POP_BURST);
    expect(town?.maxPopulation).toBe(5000 + WAYSTATION_POP_BURST);
    const waystation = tiles.get(WAYSTATION_KEY)?.waystation;
    expect(waystation?.grantedEffect).toBe("POPULATION");
    expect(waystation?.grantedTownName).toBe("Rivergate");
    expect(waystation?.grantedTownX).toBe(9);
    expect(waystation?.grantedTownY).toBe(10);
  });

  it("POPULATION effect on an unnamed town records no grantedTownName (client falls back to generic copy)", () => {
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, waystationTile()],
      [TOWN_KEY, townTile(9, 10, PLAYER_ID)]
    ]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input } = createInput(tiles, players, queueRandom([RANDOM_FOR.POPULATION]));

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-pop-unnamed");

    expect(tiles.get(WAYSTATION_KEY)?.waystation?.grantedTownName).toBeUndefined();
  });

  it("POPULATION effect with no owned town nearby is a silent no-op, but the tile still activates permanently", () => {
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, waystationTile()],
      [FAR_TOWN_KEY, townTile(400, 400, "someone-else")]
    ]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input } = createInput(tiles, players, queueRandom([RANDOM_FOR.POPULATION]));

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-pop-noop");

    expect(tiles.get(FAR_TOWN_KEY)?.town?.population).toBe(1000);
    const waystation = tiles.get(WAYSTATION_KEY)?.waystation;
    expect(waystation?.activated).toBe(true);
    expect(waystation?.grantedEffect).toBe("POPULATION");
    expect(waystation?.grantedTownName).toBeUndefined();
    expect(waystation?.grantedTownX).toBeUndefined();
    expect(waystation?.grantedTownY).toBeUndefined();
  });

  it("TECH effect grants a random unowned tier-1 tech and applies the usual side effects", () => {
    const tiles = new Map<string, DomainTileState>([[WAYSTATION_KEY, waystationTile()]]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    // First random() picks the effect (TECH); second picks the tech index within the unowned tier-1 list (index 0 -> "agriculture", the first tier-1 tech in tech-tree.json).
    const { input, events } = createInput(tiles, players, queueRandom([RANDOM_FOR.TECH, 0]));

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-tech");

    const player = players.get(PLAYER_ID)!;
    expect(player.techIds.size).toBe(1);
    const waystation = tiles.get(WAYSTATION_KEY)?.waystation;
    expect(waystation?.grantedEffect).toBe("TECH");
    expect(waystation?.grantedTechId).toBeDefined();
    expect(player.techIds.has(waystation!.grantedTechId!)).toBe(true);
    const techUpdates = events.filter((e): e is Extract<SimulationEvent, { eventType: "TECH_UPDATE" }> => e.eventType === "TECH_UPDATE");
    expect(techUpdates).toHaveLength(1);
  });

  it("TECH effect with every tier-1 tech already owned grants nothing, but still activates the tile", () => {
    const allTierOne = ["agriculture", "trade", "masonry", "leatherworking", "organized-supply", "crystal-lattices"];
    const tiles = new Map<string, DomainTileState>([[WAYSTATION_KEY, waystationTile()]]);
    const players = new Map([[PLAYER_ID, makePlayer({ techIds: new Set(allTierOne) })]]);
    const { input, events } = createInput(tiles, players, queueRandom([RANDOM_FOR.TECH]));

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-tech-noop");

    const player = players.get(PLAYER_ID)!;
    expect(player.techIds.size).toBe(allTierOne.length);
    const waystation = tiles.get(WAYSTATION_KEY)?.waystation;
    expect(waystation?.activated).toBe(true);
    expect(waystation?.grantedEffect).toBe("TECH");
    expect(waystation?.grantedTechId).toBeUndefined();
    const techUpdates = events.filter((e): e is Extract<SimulationEvent, { eventType: "TECH_UPDATE" }> => e.eventType === "TECH_UPDATE");
    expect(techUpdates).toHaveLength(0);
  });

  it("RESOURCE_SLOT effect bumps whichever resource the player has the least of", () => {
    const tiles = new Map<string, DomainTileState>([[WAYSTATION_KEY, waystationTile()]]);
    const players = new Map([[PLAYER_ID, makePlayer({ strategicResources: { FOOD: 5, TITANIUM: 1, CRYSTAL: 5, UMBRITE: 5 } })]]);
    const { input } = createInput(tiles, players, queueRandom([RANDOM_FOR.RESOURCE_SLOT]));

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-slot");

    const player = players.get(PLAYER_ID)!;
    expect(player.waystationResourceSlotBonus).toEqual({ TITANIUM: WAYSTATION_RESOURCE_SLOT_BONUS });
    expect(tiles.get(WAYSTATION_KEY)?.waystation?.grantedResource).toBe("TITANIUM");
  });

  it("RESOURCE_SLOT effect ties break to the first resource in FOOD/TITANIUM/CRYSTAL/UMBRITE order", () => {
    const tiles = new Map<string, DomainTileState>([[WAYSTATION_KEY, waystationTile()]]);
    const players = new Map([[PLAYER_ID, makePlayer()]]); // no strategicResources at all -- every count is 0, a four-way tie.
    const { input } = createInput(tiles, players, queueRandom([RANDOM_FOR.RESOURCE_SLOT]));

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-slot-tie");

    const player = players.get(PLAYER_ID)!;
    expect(player.waystationResourceSlotBonus).toEqual({ FOOD: WAYSTATION_RESOURCE_SLOT_BONUS });
    expect(tiles.get(WAYSTATION_KEY)?.waystation?.grantedResource).toBe("FOOD");
  });

  it("RESOURCE_SLOT effect can land on a different resource across two separate activations, driven by the player's current strategicResources counts", () => {
    const secondKey = "20,20";
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, waystationTile()],
      [secondKey, waystationTile({ x: 20, y: 20 })]
    ]);
    // strategicResources (the player's actual resource counts) drives the pick, not waystationResourceSlotBonus -- so a
    // player with fewer TITANIUM than FOOD lands there first, then (after TITANIUM catches up) lands on FOOD next.
    const players = new Map([[PLAYER_ID, makePlayer({ strategicResources: { FOOD: 3, TITANIUM: 1, CRYSTAL: 3, UMBRITE: 3 } })]]);
    const { input: input1 } = createInput(tiles, players, queueRandom([RANDOM_FOR.RESOURCE_SLOT]));
    activateWaystationAt(input1, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-slot-a");
    expect(players.get(PLAYER_ID)!.waystationResourceSlotBonus).toEqual({ TITANIUM: WAYSTATION_RESOURCE_SLOT_BONUS });

    players.get(PLAYER_ID)!.strategicResources = { FOOD: 3, TITANIUM: 4, CRYSTAL: 3, UMBRITE: 3 };
    const { input: input2 } = createInput(tiles, players, queueRandom([RANDOM_FOR.RESOURCE_SLOT]));
    activateWaystationAt(input2, secondKey, 20, 20, PLAYER_ID, "cmd-slot-b");

    const player = players.get(PLAYER_ID)!;
    expect(player.waystationResourceSlotBonus).toEqual({ FOOD: WAYSTATION_RESOURCE_SLOT_BONUS, TITANIUM: WAYSTATION_RESOURCE_SLOT_BONUS });
  });

  it("defaults to Math.random when no random is injected", () => {
    const tiles = new Map<string, DomainTileState>([[WAYSTATION_KEY, waystationTile()]]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input } = createInput(tiles, players);

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-default-random");

    const waystation = tiles.get(WAYSTATION_KEY)?.waystation;
    expect(waystation?.activated).toBe(true);
    expect(["VISION", "POPULATION", "TECH", "RESOURCE_SLOT"]).toContain(waystation?.grantedEffect);
  });

  // Regression for: a waystation activating while the player is offline (or
  // simply not the one watching that exact TILE_DELTA_BATCH) left them with
  // no record anywhere of what they'd been granted -- the popup only fired
  // for a live-connected client. This durable eventLog entry is what lets
  // the client show the same popup on the player's next connection, from
  // any device (see client-waystation-activation-catchup.ts).
  it("records a WAYSTATION_ACTIVATED eventLog entry with the granted effect's detail fields", () => {
    const tiles = new Map<string, DomainTileState>([[WAYSTATION_KEY, waystationTile()]]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input } = createInput(tiles, players, queueRandom([RANDOM_FOR.RESOURCE_SLOT]));

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-eventlog");

    const player = players.get(PLAYER_ID)!;
    expect(player.eventLog).toHaveLength(1);
    const entry = player.eventLog![0]!;
    expect(entry.type).toBe("WAYSTATION_ACTIVATED");
    expect(entry.x).toBe(10);
    expect(entry.y).toBe(10);
    expect(entry.grantedEffect).toBe("RESOURCE_SLOT");
    expect(entry.grantedResource).toBe("FOOD");
  });

  it("does not record an eventLog entry when re-activation is a no-op", () => {
    const tiles = new Map<string, DomainTileState>([
      [WAYSTATION_KEY, waystationTile({ waystation: { activated: true, activatedByPlayerId: PLAYER_ID, grantedEffect: "VISION" } })]
    ]);
    const players = new Map([[PLAYER_ID, makePlayer()]]);
    const { input } = createInput(tiles, players);

    activateWaystationAt(input, WAYSTATION_KEY, 10, 10, PLAYER_ID, "cmd-noop-eventlog");

    expect(players.get(PLAYER_ID)!.eventLog ?? []).toHaveLength(0);
  });
});

describe("seedWaystationVisionBonus", () => {
  it("re-applies the permanent vision bonus at the stored revealedAtX/Y for a VISION-activated waystation", () => {
    const calls: Array<{ playerId: string; x: number; y: number; radius: number }> = [];
    const coverage = { addTileVisionBonus: (playerId: string, x: number, y: number, radius: number) => { calls.push({ playerId, x, y, radius }); } };

    seedWaystationVisionBonus(coverage, {}, { x: 10, y: 10, waystation: { activated: true, activatedByPlayerId: PLAYER_ID, grantedEffect: "VISION", revealedAtX: 9, revealedAtY: 10 } });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ playerId: PLAYER_ID, x: 9, y: 10 });
  });

  it("is a no-op for a waystation activated with a non-VISION effect", () => {
    const calls: unknown[] = [];
    const coverage = { addTileVisionBonus: () => { calls.push(undefined); } };

    seedWaystationVisionBonus(coverage, {}, { x: 10, y: 10, waystation: { activated: true, activatedByPlayerId: PLAYER_ID, grantedEffect: "POPULATION" } });

    expect(calls).toHaveLength(0);
  });

  it("is a no-op for a dormant or absent waystation", () => {
    const calls: unknown[] = [];
    const coverage = { addTileVisionBonus: () => { calls.push(undefined); } };

    seedWaystationVisionBonus(coverage, {}, { x: 10, y: 10, waystation: { activated: false } });
    seedWaystationVisionBonus(coverage, {}, { x: 10, y: 10 });

    expect(calls).toHaveLength(0);
  });
});
