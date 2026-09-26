import { describe, expect, it } from "vitest";
import { applyCycleEffects } from "./galaxy-duke-cycle.js";
import { findSystem, replaceSystem } from "./galaxy-duke-systems.js";
import { duke, planet } from "./galaxy-duke-fixtures.js";

const labels = new Map([["a", "Aurelia"]]);
const dev = (i: number, kind: "MINING" | "CRYO" = "MINING") => ({ bodyIndex: i, kind });

describe("applyCycleEffects", () => {
  it("does nothing within the same Cycle", () => {
    const step = applyCycleEffects(duke([planet("a")]), 0, labels, 1);
    expect(step.effects).toEqual([]);
  });
  it("charges Influence upkeep only for developments beyond the first in each system", () => {
    let state = duke([planet("a")]);
    state = replaceSystem(state, { ...findSystem(state, "a")!, developments: [dev(0), dev(1), dev(2)] });
    const step = applyCycleEffects(state, 1, labels, 1);
    expect(step.effects).toContainEqual({ kind: "INFLUENCE_DELTA", delta: -2 });
    expect(step.state.lastCycleApplied).toBe(1);
    expect(step.state.digest.at(-1)?.text).toBe("Development upkeep: -2 Influence.");
  });
  it("a single development is free, so an Industrial Duke can grow without going into deficit", () => {
    let state = duke([planet("a")]);
    state = replaceSystem(state, { ...findSystem(state, "a")!, developments: [dev(0)] });
    expect(applyCycleEffects(state, 3, labels, 1).effects).toEqual([]);
  });
  it("a Cryo Refinery heals its own system each Cycle", () => {
    let state = duke([planet("a"), planet("b")]);
    state = replaceSystem(state, { ...findSystem(state, "a")!, developments: [dev(0, "CRYO")] });
    const step = applyCycleEffects(state, 2, labels, 1);
    expect(step.effects).toEqual([{ kind: "STABILITY_DELTA", seasonId: "a", delta: 12 }]);
    expect(step.state.digest.at(-1)?.text).toMatch(/Cryo Refinery: Aurelia regained up to 12 Stability/);
  });
  it("catches up at most 8 Cycles, so a long absence is never billed an unbounded backlog", () => {
    let state = duke([planet("a")]);
    state = replaceSystem(state, { ...findSystem(state, "a")!, developments: [dev(0), dev(1)] });
    const step = applyCycleEffects(state, 500, labels, 1);
    expect(step.effects).toContainEqual({ kind: "INFLUENCE_DELTA", delta: -8 });
    expect(step.state.lastCycleApplied).toBe(500);
  });
  it("never runs backwards if the clock moves", () => {
    const state = { ...duke(), lastCycleApplied: 10 };
    expect(applyCycleEffects(state, 4, labels, 1).state.lastCycleApplied).toBe(10);
  });
});
