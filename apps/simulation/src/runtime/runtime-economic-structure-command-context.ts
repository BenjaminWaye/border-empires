import type { RuntimeEconomicStructureCommandContext } from "../runtime-economic-structure-command-handlers.js";

/**
 * Every field the economic-structure command context (SET_CONVERTER_*,
 * UNCAPTURE_TILE) needs is already a thin pass-through of a
 * SimulationRuntime private field/method, so the deps port is identical in
 * shape to the context it builds — see `economicStructureCommandContext()`
 * in runtime.ts for the `this.*` closures.
 */
export type EconomicStructureCommandContextDeps = RuntimeEconomicStructureCommandContext;

export function buildEconomicStructureCommandContext(deps: EconomicStructureCommandContextDeps): RuntimeEconomicStructureCommandContext {
  return deps;
}
