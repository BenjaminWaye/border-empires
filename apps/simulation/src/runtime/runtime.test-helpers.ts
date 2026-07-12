import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { RuntimePlayer } from "../runtime-types.js";
import type { SimulationRuntime } from "./runtime.js";

const DEFAULT_MODS = { attack: 1, defense: 1, income: 1, vision: 1 };

/**
 * Builds a `RuntimePlayer` for the `initialPlayers` map. Covers the shape every
 * runtime test needs by default; pass `overrides` for anything a specific test
 * cares about (points, manpower, techIds, strategicResources, ...).
 */
export const buildPlayer = (id: string, overrides: Partial<RuntimePlayer> = {}): RuntimePlayer => ({
  id,
  isAi: false,
  points: 100,
  manpower: 150,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: DEFAULT_MODS,
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  ...overrides
});

/** `buildPlayer()` plus a zeroed strategicResources block, for tests that read/mutate resources. */
export const testRuntimePlayer = (id: string): RuntimePlayer =>
  buildPlayer(id, { strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } });

/** Attaches a listener and returns the array it appends every emitted event to. */
export const collectEvents = (runtime: SimulationRuntime): SimulationEvent[] => {
  const seen: SimulationEvent[] = [];
  runtime.onEvent((event) => {
    seen.push(event);
  });
  return seen;
};
