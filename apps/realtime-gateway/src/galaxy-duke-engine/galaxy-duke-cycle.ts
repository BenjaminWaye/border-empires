// Per-Cycle effects of developments (§26.8): Influence upkeep and Cryo healing.
// Applied once per global Cycle the Duke has not yet been charged for (bounded,
// so a Duke offline for a long time cannot be billed an unbounded backlog).
import { DEVELOPMENTS } from "./galaxy-duke-config.js";
import { pushDigest } from "./galaxy-duke-digest.js";
import type { DukeEffect, DukeStep } from "./galaxy-duke-production.js";
import { developmentUpkeepPerCycle } from "./galaxy-duke-systems.js";
import type { DukeState } from "./galaxy-duke-types.js";

const MAX_CATCH_UP_CYCLES = 8;

export const applyCycleEffects = (state: DukeState, cycleIndex: number, labels: ReadonlyMap<string, string>, now: number): DukeStep => {
  const cycles = Math.min(MAX_CATCH_UP_CYCLES, cycleIndex - state.lastCycleApplied);
  if (cycles <= 0) return { state: cycleIndex < state.lastCycleApplied ? state : { ...state, lastCycleApplied: Math.max(state.lastCycleApplied, cycleIndex) }, counters: [], effects: [] };
  let next: DukeState = { ...state, lastCycleApplied: cycleIndex };
  const effects: DukeEffect[] = [];
  const counters = [] as DukeStep["counters"];

  const upkeep = developmentUpkeepPerCycle(state) * cycles;
  if (upkeep > 0) {
    effects.push({ kind: "INFLUENCE_DELTA", delta: -upkeep });
    const pushed = pushDigest(next, now, "ECONOMY", `Development upkeep: -${upkeep} Influence.`);
    next = pushed.state;
    counters.push(...pushed.counters);
  }
  for (const system of state.systems) {
    const heal = system.developments.reduce((sum, d) => sum + DEVELOPMENTS[d.kind].stabilityPerCycle, 0) * cycles;
    if (heal <= 0) continue;
    effects.push({ kind: "STABILITY_DELTA", seasonId: system.seasonId, delta: heal });
    const pushed = pushDigest(next, now, "ECONOMY", `Cryo Refinery: ${labels.get(system.seasonId) ?? "your system"} regained up to ${heal} Stability.`);
    next = pushed.state;
    counters.push(...pushed.counters);
  }
  return { state: next, counters, effects };
};
