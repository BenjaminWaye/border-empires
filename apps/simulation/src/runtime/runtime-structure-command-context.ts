import type { RuntimeStructureCommandContext } from "../runtime-structure-command-handlers.js";

/**
 * Every field the structure command context (BUILD_STRUCTURE, SET_MUSTER,
 * CLEAR_MUSTER, WATCH_MUSTER, UNWATCH_MUSTER, CANCEL_FORT_BUILD,
 * CANCEL_STRUCTURE_BUILD, REMOVE_STRUCTURE, CANCEL_SIEGE_OUTPOST_BUILD)
 * needs is already a thin pass-through of a SimulationRuntime private
 * field/method, so the deps port is identical in shape to the context it
 * builds — see `structureCommandContext()` in runtime.ts for the `this.*`
 * closures. `completeStructureBuild`, `completeStructureRemoval`, and
 * `cancelActiveOutpostAttackLocks` stay as private methods on
 * SimulationRuntime (not part of this port) because they are also called
 * directly by scheduled-timer closures and by the rush-buy command context,
 * outside of any dispatch-table handler.
 */
export type StructureCommandContextDeps = RuntimeStructureCommandContext;

export function buildStructureCommandContext(deps: StructureCommandContextDeps): RuntimeStructureCommandContext {
  return deps;
}
