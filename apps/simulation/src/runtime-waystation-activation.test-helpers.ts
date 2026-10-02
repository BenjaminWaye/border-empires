import { DEFAULT_AUTO_SETTLE_PREFS } from "@border-empires/shared";
// Shared setup for the runtime-waystation-activation*.test.ts suites.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { WaystationActivationInput } from "./runtime-waystation-activation.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";

export const PLAYER_ID = "player-1";
export const WAYSTATION_KEY = "10,10";
export const TOWN_KEY = "9,10";
export const FAR_TOWN_KEY = "400,400";

// Effect roll order in runtime-waystation-activation.ts: 0=VISION, 1=POPULATION, 2=TECH, 3=RESOURCE_SLOT, 4=GOLD, 5=MANPOWER (floor(r * 6)).
export const RANDOM_FOR = { VISION: 0.05, POPULATION: 0.2, TECH: 0.4, RESOURCE_SLOT: 0.55, GOLD: 0.75, MANPOWER: 0.95 };

/** A queue-based random stub: returns each value in order, then repeats the last value forever (so a test doesn't need to know exactly how many times `random()` is called). */
export function queueRandom(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

export function makePlayer(overrides: Partial<DomainPlayer> = {}): DomainPlayer {
  return { id: PLAYER_ID, isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set(), autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS }, ...overrides };
}

export function createInput(
  tiles: Map<string, DomainTileState>,
  players: Map<string, DomainPlayer>,
  random?: () => number,
  alreadyVisibleTileKeys: ReadonlySet<string> = new Set(),
  manpowerCap = 720
): { input: WaystationActivationInput; events: SimulationEvent[]; impacts: unknown[]; reveals: Array<{ playerId: string; x: number; y: number; radius: number }> } {
  const events: SimulationEvent[] = [];
  const impacts: unknown[] = [];
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
    recordPersonalImpact: (impact) => { impacts.push(impact); },
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y, ownerId: tile.ownerId, ownershipState: tile.ownershipState } as SimulationTileWireDelta),
    // Tests run with no elapsed time, so there's no regen to settle.
    refreshManpower: () => {},
    playerManpowerCap: () => manpowerCap,
    ...(random ? { random } : {})
  };
  return { input, events, impacts, reveals };
}

export const waystationTile = (overrides: Partial<DomainTileState> = {}): DomainTileState => ({
  x: 10, y: 10, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "FRONTIER", waystation: { activated: false }, ...overrides
});

export const townTile = (x: number, y: number, ownerId: string | undefined, population = 1000, maxPopulation = 5000, name?: string): DomainTileState => ({
  x, y, terrain: "LAND", ownerId, ownershipState: ownerId ? "SETTLED" : undefined,
  town: { type: "MARKET", populationTier: "TOWN", population, maxPopulation, ...(name ? { name } : {}) }
});
