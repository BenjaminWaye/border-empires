import { describe, expect, it } from "vitest";

import {
  combatFromSimulationEvent,
  createAiDiplomacyMemory,
  MAX_DIPLOMACY_MEMORY_PAIRS,
  WAR_MEMORY_HALF_LIFE_MS
} from "./ai-diplomacy-memory.js";

const setup = () => {
  const clock = { now: 1_000 };
  const memory = createAiDiplomacyMemory({ now: () => clock.now, isAi: (id) => id.startsWith("ai-") });
  return { clock, memory };
};

describe("createAiDiplomacyMemory", () => {
  it("remembers fights from each AI's side and lets them fade", () => {
    const { clock, memory } = setup();
    memory.observeCombat({ attackerId: "p1", defenderId: "ai-1", attackerWon: true, tilesCaptured: 4 });
    memory.observeCombat({ attackerId: "ai-1", defenderId: "p1", attackerWon: true, tilesCaptured: 1 });
    expect(memory.view("ai-1", "p1")).toEqual(
      expect.objectContaining({ tilesTakenFromAi: 4, tilesTakenByAi: 1, battles: 2, lastPlayerAttackAt: 1_000, lastCombatAt: 1_000 })
    );
    clock.now += WAR_MEMORY_HALF_LIFE_MS;
    expect(memory.view("ai-1", "p1").tilesTakenFromAi).toBeCloseTo(2);
  });

  it("counts a failed attack as aggression but captures nothing", () => {
    const { memory } = setup();
    memory.observeCombat({ attackerId: "p1", defenderId: "ai-1", attackerWon: false, tilesCaptured: 3 });
    expect(memory.view("ai-1", "p1")).toEqual(expect.objectContaining({ tilesTakenFromAi: 0, lastPlayerAttackAt: 1_000 }));
  });

  it("ignores human-only fights", () => {
    const { memory } = setup();
    memory.observeCombat({ attackerId: "p1", defenderId: "p2", attackerWon: true, tilesCaptured: 3 });
    expect(memory.size()).toBe(0);
  });

  // The AI pays for peace once per war: only new fighting re-opens its purse.
  it("tracks whether the AI already paid in the current war", () => {
    const { clock, memory } = setup();
    memory.observeCombat({ attackerId: "p1", defenderId: "ai-1", attackerWon: true, tilesCaptured: 1 });
    clock.now += 1_000;
    memory.recordPayment("ai-1", "p1", -50);
    expect(memory.view("ai-1", "p1").aiAlreadyPaidThisWar).toBe(true);
    clock.now += 1_000;
    memory.observeCombat({ attackerId: "p1", defenderId: "ai-1", attackerWon: true, tilesCaptured: 1 });
    expect(memory.view("ai-1", "p1").aiAlreadyPaidThisWar).toBe(false);
  });

  it("records goodwill and repeat truces", () => {
    const { memory } = setup();
    memory.recordPayment("ai-1", "p1", 300);
    memory.recordTruceDeal("ai-1", "p1");
    expect(memory.view("ai-1", "p1")).toEqual(expect.objectContaining({ goodwillCoin: 300, truceDeals: 1 }));
  });

  it("stays bounded, forgetting the least recently touched pair", () => {
    const { clock, memory } = setup();
    for (let index = 0; index < MAX_DIPLOMACY_MEMORY_PAIRS; index += 1) {
      clock.now += 1;
      memory.recordTruceDeal("ai-1", `p${index}`);
    }
    // Touching the oldest pair again makes p1 the least recently touched.
    memory.recordTruceDeal("ai-1", "p0");
    memory.recordTruceDeal("ai-2", "late");
    expect(memory.size()).toBe(MAX_DIPLOMACY_MEMORY_PAIRS);
    expect(memory.view("ai-1", "p1").truceDeals).toBe(0);
    expect(memory.view("ai-1", "p0").truceDeals).toBeGreaterThan(1);
    expect(memory.view("ai-2", "late").truceDeals).toBe(1);
  });
});

describe("combatFromSimulationEvent", () => {
  it("reads attacker, defender and captured tiles from COMBAT_RESOLVED", () => {
    expect(
      combatFromSimulationEvent({
        eventType: "COMBAT_RESOLVED",
        playerId: "p1",
        attackerWon: true,
        combatResult: { defenderOwnerId: "ai-1", changes: [{ ownerId: "p1" }, { ownerId: "p1" }, { ownerId: "ai-1" }] }
      })
    ).toEqual({ attackerId: "p1", defenderId: "ai-1", attackerWon: true, tilesCaptured: 2 });
  });

  it("skips barbarians, neutral tiles and other events", () => {
    expect(combatFromSimulationEvent({ eventType: "COMBAT_RESOLVED", playerId: "p1", combatResult: { defenderOwnerId: "barbarian-1" } })).toBeUndefined();
    expect(combatFromSimulationEvent({ eventType: "COMBAT_RESOLVED", playerId: "p1", combatResult: {} })).toBeUndefined();
    expect(combatFromSimulationEvent({ eventType: "COMMAND_RESOLVED", playerId: "p1" })).toBeUndefined();
  });
});
