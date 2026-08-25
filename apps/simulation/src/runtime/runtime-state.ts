import type { DomainTileState } from "@border-empires/game-domain";
import type { RuntimePlayer } from "../runtime-types.js";

/**
 * Stage 7 of the SimulationRuntime god-class breakup: a plain data holder for
 * the core shared world-state fields that used to live directly on
 * SimulationRuntime. This is pure indirection (zero behavior change) — it
 * exists so future subsystem classes (Stage 8) have something shared to hold
 * a reference to instead of `this`. Fields are constructed up front by
 * SimulationRuntime's constructor and never reassigned afterward; the Maps
 * themselves are still mutated in place by the existing runtime logic.
 *
 * Fields are added to this class incrementally, one small commit at a time
 * (see Stage 7 process notes) rather than all at once.
 */
export class RuntimeState {
  readonly players: Map<string, RuntimePlayer>;
  readonly tiles: Map<string, DomainTileState>;

  constructor(init: {
    players: Map<string, RuntimePlayer>;
    tiles: Map<string, DomainTileState>;
  }) {
    this.players = init.players;
    this.tiles = init.tiles;
  }
}
