import { describe, expect, it } from "vitest";
import { afcMomentumAfterVictory, afcMomentumStacks } from "./afc-momentum.js";

describe("flag-local Battlefield Momentum", () => {
  it("grants stacks only for garrisoned wins and caps at three", () => {
    expect(afcMomentumAfterVictory(undefined, false, 0)).toBeUndefined();
    let state = afcMomentumAfterVictory(undefined, true, 0);
    expect(state?.stacks).toBe(1);
    for (let i = 0; i < 10; i += 1) state = afcMomentumAfterVictory(state, true, i * 1000);
    expect(state?.stacks).toBe(3);
    expect(afcMomentumStacks(undefined, 0)).toBe(0);
  });
  it("frontier captures refresh the timer without granting stacks", () => {
    const state = afcMomentumAfterVictory({ stacks: 3, decayAt: 300_000 }, false, 299_000)!;
    expect(state).toEqual({ stacks: 3, decayAt: 599_000 });
    expect(afcMomentumStacks(state, 598_999)).toBe(3);
    expect(afcMomentumStacks(state, 599_000)).toBe(2);
  });
  it("decays by elapsed idle time rather than by the number of server ticks", () => {
    const state = { stacks: 3, decayAt: 300_000 };
    expect(afcMomentumStacks(state, 600_000)).toBe(1);
    expect(afcMomentumStacks(state, 1_200_000)).toBe(0);
    expect(afcMomentumAfterVictory(state, true, 1_200_000)?.stacks).toBe(1);
  });
});
