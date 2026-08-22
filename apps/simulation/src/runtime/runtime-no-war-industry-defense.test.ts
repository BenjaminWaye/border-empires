import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// Mirror of the "doubles attacker effectiveness when the defender has no war
// industry..." test in runtime.test.ts, but from the defender's side: an
// attacker missing either Weapons Factory type empire-wide hands the
// defender the same flat NO_WAR_INDUSTRY_ATTACK_VULNERABILITY_MULT on their
// effective defense (runtime-combat-support.ts,
// noWarIndustryVulnerabilityMultForAttacker).
describe("simulation runtime — no war industry defense vulnerability", () => {
  it("doubles defender effectiveness when the attacker has no war industry, and clears once both factory types exist", async () => {
    const factoryTile = (x: number, y: number, ownerId: string, type: "TITANIUM_WEAPONS_FACTORY" | "UMBRITE_WEAPONS_FACTORY") => ({
      x,
      y,
      terrain: "LAND" as const,
      ownerId,
      ownershipState: "SETTLED" as const,
      economicStructure: { ownerId, type, status: "active" as const }
    });
    const buildRuntime = (attackerFactories: Array<"TITANIUM_WEAPONS_FACTORY" | "UMBRITE_WEAPONS_FACTORY">): SimulationRuntime =>
      new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1", { manpower: 5_000 })],
          ["player-2", buildPlayer("player-2", { manpower: 5_000 })]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            {
              x: 10,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 }
            },
            // No town on the target — keeps the defender's baseline defense
            // at a flat SETTLED-only 1.35x so the doubling is easy to isolate.
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
            ...attackerFactories.map((type, i) => factoryTile(9 - i, 9, "player-1", type))
          ],
          activeLocks: []
        }
      });

    const captureDefEff = async (runtime: SimulationRuntime): Promise<number | undefined> => {
      const seen = collectEvents(runtime);
      runtime.submitCommand({
        commandId: "atk-unarmed-defense-1",
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
      return accepted?.combatResult?.defEff;
    };

    const neitherFactory = await captureDefEff(buildRuntime([]));
    const titaniumOnly = await captureDefEff(buildRuntime(["TITANIUM_WEAPONS_FACTORY"]));
    const both = await captureDefEff(buildRuntime(["TITANIUM_WEAPONS_FACTORY", "UMBRITE_WEAPONS_FACTORY"]));

    // Missing both -> flat 2x on top of the 1.35x SETTLED base, same as
    // missing just one (does not stack to 4x).
    expect(neitherFactory).toBeCloseTo(10 * 1.35 * 2, 6);
    expect(titaniumOnly).toBeCloseTo(10 * 1.35 * 2, 6);
    // Both present -> no vulnerability penalty.
    expect(both).toBeCloseTo(10 * 1.35, 6);
  });
});
