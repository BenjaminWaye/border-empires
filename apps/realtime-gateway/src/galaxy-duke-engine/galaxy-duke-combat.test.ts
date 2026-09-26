import { describe, expect, it } from "vitest";
import { hitsRemaining, resolveFighterRaid, resolveWardenIncursion } from "./galaxy-duke-combat.js";

describe("resolveWardenIncursion", () => {
  it("undefended: flat 20 Stability", () => {
    expect(resolveWardenIncursion([])).toMatchObject({ repelled: false, stabilityLoss: 20, fighterLost: false });
  });
  it("a Fighter kills the relic and takes 20 hull damage", () => {
    const out = resolveWardenIncursion([{ hull: 100 }]);
    expect(out).toMatchObject({ repelled: true, stabilityLoss: 0, hullLoss: 20, fighterLost: false });
    expect(out.fighters).toEqual([{ hull: 80 }]);
  });
  it("the healthiest Fighter takes the hit", () => {
    expect(resolveWardenIncursion([{ hull: 40 }, { hull: 90 }]).fighters).toEqual([{ hull: 40 }, { hull: 70 }]);
  });
  it("a Fighter at 20 hull dies but still repels (simultaneous exchange)", () => {
    const out = resolveWardenIncursion([{ hull: 20 }]);
    expect(out).toMatchObject({ repelled: true, fighterLost: true, stabilityLoss: 0 });
    expect(out.fighters).toEqual([]);
  });
  it("a dead-hull Fighter does not count as a defender", () => {
    expect(resolveWardenIncursion([{ hull: 0 }]).stabilityLoss).toBe(20);
  });
});

describe("resolveFighterRaid", () => {
  it("no defender: through for a flat 20, attacker unharmed", () => {
    expect(resolveFighterRaid(100, [])).toMatchObject({ through: true, stabilityLoss: 20, attackerHullAfter: 100, exchanged: false });
  });
  it("an equal Fighter trades 40 each way and holds", () => {
    const out = resolveFighterRaid(100, [{ hull: 100 }]);
    expect(out).toMatchObject({ through: false, stabilityLoss: 0, attackerHullAfter: 60 });
    expect(out.defenderFighters).toEqual([{ hull: 60 }]);
  });
  it("a weakened defender is destroyed and the raid gets through for exactly 20", () => {
    const out = resolveFighterRaid(100, [{ hull: 40 }]);
    expect(out).toMatchObject({ through: true, stabilityLoss: 20, defenderLost: true, attackerHullAfter: 60 });
    expect(out.defenderFighters).toEqual([]);
  });
  it("an attacker with 40 hull dies in the exchange", () => {
    expect(resolveFighterRaid(40, [{ hull: 100 }])).toMatchObject({ attackerLost: true, attackerHullAfter: 0 });
  });
});

describe("hitsRemaining", () => {
  it("100 Stability is five hits; the tooltip number floors", () => {
    expect(hitsRemaining(100)).toBe(5);
    expect(hitsRemaining(80)).toBe(4);
    expect(hitsRemaining(19)).toBe(0);
  });
});
