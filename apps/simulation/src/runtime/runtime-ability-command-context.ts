import type { RuntimeAbilityCommandContext } from "../runtime-ability-command-handlers.js";

/**
 * Every field the ability command context (REVEAL_EMPIRE, SURVEY_SWEEP,
 * AETHER_LANCE, CAST_AETHER_BRIDGE/WALL, SIPHON_TILE, PURGE_SIPHON) needs is
 * already a thin pass-through of a SimulationRuntime private field/method, so
 * the deps port is identical in shape to the context it builds — see
 * `abilityCommandContext()` in runtime.ts for the `this.*` closures.
 */
export type AbilityCommandContextDeps = RuntimeAbilityCommandContext;

export function buildAbilityCommandContext(deps: AbilityCommandContextDeps): RuntimeAbilityCommandContext {
  return deps;
}
