import { describe, expect, it } from "vitest";
import { HILLS_DEFENSE_MULT, RIVER_CROSSING_ATTACK_MULT } from "../config.js";
import { terrainCombatModifiersFromFacts } from "../terrain-combat/terrain-combat.js";
import { buildFrontierCombatPreview } from "./frontier-combat.js";

describe("frontier combat terrain terms", () => {
  const terrain = terrainCombatModifiersFromFacts({ hillsDefense: true, riverCrossing: true });

  it("multiplies a garrisoned hills defender and a river-crossing attacker", () => {
    const flat = buildFrontierCombatPreview({ ownershipState: "SETTLED" });
    const both = buildFrontierCombatPreview({ ownershipState: "SETTLED" }, terrain);
    expect(both.defMult).toBeCloseTo(flat.defMult * HILLS_DEFENSE_MULT);
    expect(both.atkMult).toBeCloseTo(flat.atkMult * RIVER_CROSSING_ATTACK_MULT);
    expect(both.defender.battle.map((e) => e.label)).toContain("Hills");
    expect(both.attacker.battle.map((e) => e.label)).toContain("River crossing");
    expect(both.winChance).toBeLessThan(flat.winChance);
  });

  it("applies hills to a capture-held tile too", () => {
    const held = { ownershipState: "FRONTIER", captureHoldUntil: 2_000 };
    const flat = buildFrontierCombatPreview(held, { nowMs: 1_000 });
    const hills = buildFrontierCombatPreview(held, { nowMs: 1_000, ...terrain });
    expect(hills.defMult).toBeCloseTo(flat.defMult * HILLS_DEFENSE_MULT);
  });

  it("never makes undefended frontier defend", () => {
    const frontier = buildFrontierCombatPreview({ ownershipState: "FRONTIER" }, terrain);
    expect(frontier.defMult).toBe(0);
    expect(frontier.winChance).toBe(1);
  });

  it("adds no breakdown rows when no terrain fact applies", () => {
    expect(terrainCombatModifiersFromFacts({ hillsDefense: false, riverCrossing: false })).toEqual({});
  });
});
