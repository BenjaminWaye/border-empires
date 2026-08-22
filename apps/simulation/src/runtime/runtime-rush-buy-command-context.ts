import type { RuntimeRushBuyCommandContext } from "../runtime-rush-buy-command.js";

/**
 * Every field the rush-buy command context (RUSH_BUY) needs is already a
 * thin pass-through of a SimulationRuntime private field/method, so the deps
 * port is identical in shape to the context it builds — see
 * `rushBuyCommandContext()` in runtime.ts for the `this.*` closures.
 */
export type RushBuyCommandContextDeps = RuntimeRushBuyCommandContext;

export function buildRushBuyCommandContext(deps: RushBuyCommandContextDeps): RuntimeRushBuyCommandContext {
  return deps;
}
