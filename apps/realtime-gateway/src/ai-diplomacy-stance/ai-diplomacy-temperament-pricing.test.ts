import { describe, expect, it } from "vitest";

import type { DiplomacyMemoryView } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { foughtLately, HOUR, memory, NOW, price } from "./ai-diplomacy-pricing-test-helpers.js";
import { AI_TEMPERAMENTS, type AiTemperament } from "./ai-diplomacy-temperament.js";

describe("AI temperaments", () => {
  const { MERCHANT, WARLIKE, PEACEABLE, VENGEFUL } = AI_TEMPERAMENTS;
  const atWar = (overrides: Partial<DiplomacyMemoryView> = {}): DiplomacyMemoryView =>
    memory({ lastCombatAt: NOW - HOUR, lastPlayerAttackAt: NOW - 2 * HOUR, ...overrides });

  it("leaves a Measured AI's prices alone", () => {
    expect(price({ temperament: AI_TEMPERAMENTS.MEASURED }).pricing.required).toEqual(price({}).pricing.required);
  });

  it("scales only the base truce price, not reparations", () => {
    expect(price({ temperament: MERCHANT, memory: foughtLately() }).pricing.required.truce12).toBe(9 * 60);
    const fair = atWar({ tilesTakenFromAi: 1, tilesTakenByAi: 1 });
    const baseline = price({ memory: fair }).pricing.required.truce12!;
    const discount = price({ memory: fair, temperament: MERCHANT }).pricing.required.truce12!;
    expect(discount).toBeGreaterThan(baseline * 0.75);
    expect(discount).toBeLessThan(baseline);
  });

  // -10 for contested borders plus -5 crosses into Annoyed, where prices are 1.5x again.
  it("makes a Warlike neighbour colder and dearer", () => {
    const result = price({ temperament: WARLIKE, memory: foughtLately() });
    expect(result.opinion.modifiers).toContainEqual({ label: "Warlike temperament", value: -5 });
    expect(result.opinion.attitude).toBe("ANNOYED");
    expect(result.pricing.required.truce12).toBe(12 * 1.25 * 1.5 * 60);
  });

  it("warms a Peaceable AI enough to ally without tribute when borders don't meet", () => {
    const result = price({ temperament: PEACEABLE, bordersTouch: false });
    expect(result.opinion.attitude).toBe("PLEASED");
    expect(result.allianceRefusal).toBeUndefined();
  });

  it("weighs taken tiles by grudge, in opinion and in reparations", () => {
    const took = memory({ tilesTakenFromAi: 2 });
    const modifier = (temperament?: AiTemperament) =>
      price({ memory: took, ...(temperament ? { temperament } : {}) }).opinion.modifiers.find((entry) => entry.label.startsWith("You took"))?.value;
    expect(modifier()).toBe(-8);
    expect(modifier(VENGEFUL)).toBe(-12);
    expect(modifier(PEACEABLE)).toBe(-6);
    const peacefulBorders = { bordersTouch: false, memory: took };
    expect(price({ ...peacefulBorders, temperament: VENGEFUL }).pricing.required.truce12).toBe((2 + 3) * 60);
  });

  it("has a Warlike AI pay half as much to end a war it is losing", () => {
    const losing = atWar({ tilesTakenFromAi: 5 });
    const withCoin = { memory: losing, aiIncome: 100, aiGold: 1000 };
    expect(price(withCoin).pricing.required.truce12).toBe(-250);
    expect(price({ ...withCoin, temperament: WARLIKE }).pricing.required.truce12).toBe(-125);
  });
});

