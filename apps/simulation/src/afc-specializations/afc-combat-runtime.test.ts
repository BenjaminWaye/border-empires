import type { RecoveredLock } from "../event-recovery/event-recovery.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

const land = (x: number, ownerId: string): DomainTileState => ({ x, y: 10, terrain: "LAND", ownerId, ownershipState: "SETTLED" });
const slots = { FOOD: 100, TITANIUM: 100, UMBRITE: 100, CRYSTAL: 100 };
function setup(attackerDomains: string[], defenderDomains: string[], extraTiles: DomainTileState[] = [], activeLocks: RecoveredLock[] = []) {
  vi.useFakeTimers(); vi.spyOn(Math, "random").mockReturnValue(0);
  let now = 1000;
  const origin = { ...land(10, "p"), afc: { ownerId: "p", status: "active" as const, modules: [] }, muster: { ownerId: "p", amount: 5000, mode: "HOLD" as const, setAt: 1000 } };
  const target = { ...land(11, "e"), afc: { ownerId: "e", status: "active" as const, modules: [] }, fort: { ownerId: "e", status: "active" as const, variant: "FORT" as const } };
  const runtime = new SimulationRuntime({ now: () => now, seedTiles: new Map(), initialPlayers: new Map([
    ["p", buildPlayer("p", { afcUpgradeRuleset: "afc-v1", domainIds: new Set(attackerDomains), waystationResourceSlotBonus: slots })],
    ["e", buildPlayer("e", { afcUpgradeRuleset: "afc-v1", domainIds: new Set(defenderDomains), waystationResourceSlotBonus: slots })]
  ]), initialState: { tiles: [origin, target, ...extraTiles], activeLocks } });
  const seen = collectEvents(runtime);
  const attack = async () => {
    runtime.submitCommand({ commandId: "battle", sessionId: "test", playerId: "p", clientSeq: 1, issuedAt: now, type: "ATTACK", payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 }) });
    await Promise.resolve(); now += 120_000; await vi.advanceTimersByTimeAsync(120_000);
  };
  return { runtime, seen, attack };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("AFC combat effects through normal battle resolution", () => {
  it("blocks the first otherwise successful breach, spends full manpower and keeps the origin", async () => {
    const { runtime, seen, attack } = setup([], ["afc-bastion-5"]);
    await attack();
    const resolved = seen.find(event => event.eventType === "COMBAT_RESOLVED");
    expect(resolved).toMatchObject({ attackerWon: false, combatResult: { wardRechargesAt: expect.any(Number), changes: [] } });
    const state = runtime.exportState();
    expect(state.tiles.find(t => t.x === 10)?.ownerId).toBe("p");
    expect(state.tiles.find(t => t.x === 11)?.ownerId).toBe("e");
    expect(JSON.parse(state.tiles.find(t => t.x === 10)!.musterJson!).amount).toBe(4700);
    expect(state.players.find(p => p.id === "e")?.afcCampaign?.fortWardRecharges?.["11,10"]).toBeGreaterThan(120_000);
  });
  it("captures one connected garrisoned tile without recursively capturing another or awarding a second Momentum stack", async () => {
    const town = { type: "MARKET" as const, populationTier: "TOWN" as const, population: 8000, maxPopulation: 10000 };
    const { runtime, seen, attack } = setup(["afc-vanguard-3", "afc-vanguard-5"], [], [{ ...land(12, "e"), town }, { ...land(13, "e"), town }]);
    await attack();
    expect(seen.filter(event => event.eventType === "COMMAND_REJECTED")).toEqual([]);
    expect(seen.find(event => event.eventType === "COMBAT_RESOLVED")).toMatchObject({ attackerWon: true });
    const state = runtime.exportState();
    expect(state.tiles.find(t => t.x === 11)?.ownerId).toBe("p");
    expect(state.tiles.find(t => t.x === 12)?.ownerId).toBe("p");
    expect(state.tiles.find(t => t.x === 13)?.ownerId).toBe("e");
    expect(JSON.parse(state.tiles.find(t => t.x === 10)!.musterJson!).momentum?.stacks).toBe(1);
    expect(seen.filter(event => event.eventType === "COMBAT_RESOLVED")).toHaveLength(1);
  });
  it("does not grant a bonus capture on the origin of another battle", async () => {
    const { runtime, attack } = setup(["afc-vanguard-5"], [], [{ ...land(12, "e"), town: { type: "MARKET", populationTier: "TOWN", population: 1000, maxPopulation: 2000 } }, { ...land(12, "p"), y: 11 }], [{
      commandId: "enemy-in-flight", playerId: "e", actionType: "ATTACK", originX: 12, originY: 10, targetX: 12, targetY: 11, originKey: "12,10", targetKey: "12,11", resolvesAt: 999_999
    }]);
    await attack();
    expect(runtime.exportState().tiles.find(tile => tile.x === 11 && tile.y === 10)?.ownerId).toBe("p");
    expect(runtime.exportState().tiles.find(tile => tile.x === 12 && tile.y === 10)?.ownerId).toBe("e");
  });

});
