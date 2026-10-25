import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

type FactoryType = "TITANIUM_WEAPONS_FACTORY" | "UMBRITE_WEAPONS_FACTORY";

// "Unarmed" vulnerability (warIndustryEdge in frontier-combat.ts, wired via
// noWarIndustryEdgeFor{Attacker,Defender} in runtime-weapons-factory-mults.ts):
// a side gets the flat NO_WAR_INDUSTRY_ATTACK_VULNERABILITY_MULT (2x) only
// for a Weapons Factory type it owns and the other side lacks. Lacking a
// type you don't own yourself earns nothing.
describe("simulation runtime — no war industry vulnerability", () => {
  const factoryTile = (x: number, y: number, ownerId: string, type: FactoryType) => ({
    x,
    y,
    terrain: "LAND" as const,
    ownerId,
    ownershipState: "SETTLED" as const,
    economicStructure: { ownerId, type, status: "active" as const }
  });
  const buildRuntime = (attackerFactories: FactoryType[], defenderFactories: FactoryType[]): SimulationRuntime =>
    new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 5_000 })],
        ["player-2", buildPlayer("player-2", { manpower: 5_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }, // supply-connects the attack origin (stranded origins decay)
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER",
            muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
          },
          // No towns anywhere — keeps both sides' baselines flat (10 attack,
          // 1.3x SETTLED defense) and factories un-concentrated, so each
          // factory is a plain per-copy mult and the doubling is easy to isolate.
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          ...attackerFactories.map((type, i) => factoryTile(9 - i, 9, "player-1", type)),
          ...defenderFactories.map((type, i) => factoryTile(11 + i, 11, "player-2", type))
        ],
        activeLocks: []
      }
    });

  const captureEff = async (attackerFactories: FactoryType[], defenderFactories: FactoryType[]): Promise<{ atkEff: number; defEff: number } | undefined> => {
    const runtime = buildRuntime(attackerFactories, defenderFactories);
    const seen = collectEvents(runtime);
    runtime.submitCommand({
      commandId: "atk-unarmed-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });
    await Promise.resolve();
    const accepted = seen.find(
      (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
        event.eventType === "COMMAND_ACCEPTED"
    );
    return accepted?.combatResult ? { atkEff: accepted.combatResult.atkEff, defEff: accepted.combatResult.defEff } : undefined;
  };

  const TI = "TITANIUM_WEAPONS_FACTORY" as const;
  const UM = "UMBRITE_WEAPONS_FACTORY" as const;

  it("gives neither side the bonus when neither owns any factory", async () => {
    const eff = await captureEff([], []);
    expect(eff?.atkEff).toBeCloseTo(10, 6);
    expect(eff?.defEff).toBeCloseTo(10 * 1.3, 6);
  });

  it("doubles only the defender when the attacker has no factories and the defender owns Titanium", async () => {
    // Regression: the attacker used to get 2x for the defender's missing
    // Umbrite even though the attacker owned no Umbrite either.
    const eff = await captureEff([], [TI]);
    expect(eff?.atkEff).toBeCloseTo(10, 6);
    expect(eff?.defEff).toBeCloseTo(10 * 1.3 * 1.03 * 2, 6);
  });

  it("doubles only the attacker when the attacker owns a type the defender lacks", async () => {
    const eff = await captureEff([TI], []);
    expect(eff?.atkEff).toBeCloseTo(10 * 1.015 * 2, 6);
    expect(eff?.defEff).toBeCloseTo(10 * 1.3, 6);
  });

  it("doubles both sides when each owns a type the other lacks", async () => {
    const eff = await captureEff([TI], [UM]);
    expect(eff?.atkEff).toBeCloseTo(10 * 1.015 * 2, 6);
    expect(eff?.defEff).toBeCloseTo(10 * 1.3 * 1.015 * 2, 6);
  });

  it("does not stack to 4x when the other side lacks both types", async () => {
    const eff = await captureEff([TI, UM], []);
    expect(eff?.atkEff).toBeCloseTo(10 * 1.015 * 1.03 * 2, 6);
    expect(eff?.defEff).toBeCloseTo(10 * 1.3, 6);
  });

  it("clears for both sides once both own both types", async () => {
    const eff = await captureEff([TI, UM], [TI, UM]);
    expect(eff?.atkEff).toBeCloseTo(10 * 1.015 * 1.03, 6);
    expect(eff?.defEff).toBeCloseTo(10 * 1.3 * 1.03 * 1.015, 6);
  });
});
