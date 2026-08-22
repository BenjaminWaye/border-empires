import type { RuntimeMapCommandContext } from "../runtime-map-command-handlers.js";

/**
 * Every field the map command context (CREATE_MOUNTAIN, REMOVE_MOUNTAIN,
 * AIRPORT_BOMBARD, IMPERIAL_EXCHANGE_LEVY, WORLD_ENGINE_STRIKE, AEGIS_LOCK,
 * ASTRAL_DOCK_LAUNCH, TITANIUM_LEVY_MUSTER, ACTIVATE_IMPERIAL_WARD,
 * SYNC_TRUCE) needs is already a thin pass-through of a SimulationRuntime
 * private field/method, so the deps port is identical in shape to the
 * context it builds — see `mapCommandContext()` in runtime.ts for the
 * `this.*` closures.
 */
export type MapCommandContextDeps = RuntimeMapCommandContext;

export function buildMapCommandContext(deps: MapCommandContextDeps): RuntimeMapCommandContext {
  return deps;
}
