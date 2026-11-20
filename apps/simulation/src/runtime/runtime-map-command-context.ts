import { isTileBombardBlockedByRadar } from "../runtime-ability-helpers.js";
import type { RuntimeMapCommandContext } from "../runtime-map-command-handlers.js";

/**
 * Every field the map command context (CREATE_MOUNTAIN, REMOVE_MOUNTAIN,
 * SKY_DOCK_BOMBARD, IMPERIAL_EXCHANGE_LEVY, SOVEREIGN_SIEGE_ENGINE_STRIKE, AEGIS_LOCK,
 * ASTRAL_DOCK_LAUNCH, TITANIUM_LEVY_MUSTER,
 * SYNC_TRUCE) needs is a thin pass-through of a SimulationRuntime private
 * field/method — see `mapCommandContext()` in runtime.ts for the `this.*`
 * closures. The one exception, the radar bombard check, is built here from
 * the tiles, structure dormancy and clock the deps already carry.
 */
export type MapCommandContextDeps = Omit<RuntimeMapCommandContext, "isTileBombardBlockedByRadar">;

export function buildMapCommandContext(deps: MapCommandContextDeps): RuntimeMapCommandContext {
  return {
    ...deps,
    isTileBombardBlockedByRadar: (actorId, targetX, targetY) =>
      isTileBombardBlockedByRadar(deps.tiles, deps.isStructureDormant, actorId, targetX, targetY, deps.now())
  };
}
