import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { FORCED_ANCILLARIFICATION_COOLDOWN_MS } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";
import { applySimulationEventsToRecoveredState } from "../event-recovery/event-recovery.js";

const town = (population = 20_000): DomainTileState => ({ x: 10, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN", population } });
const factory = (x = 11): DomainTileState => ({ x, y: 10, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", economicStructure: { ownerId: "p", type: "ANCILLARY_FACTORY", status: "active" } });
const command = (id: string, x = 11): CommandEnvelope => ({ type: "FORCED_ANCILLARIFICATION", commandId: id, playerId: "p", sessionId: "factory-test", clientSeq: Number(id), issuedAt: 1000, payloadJson: JSON.stringify({ x, y: 10 }) });
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function setup(tiles = [town(), factory()], food = 20) {
  let now = 1000;
  const runtime = new SimulationRuntime({ now: () => now, scheduleAfter: () => {}, seedTiles: new Map(),
    initialPlayers: new Map([["p", buildPlayer("p", { manpower: 5000, waystationManpowerOverflow: 5000, landingReserveGranted: true, waystationResourceSlotBonus: { FOOD: food } })]]),
    initialState: { tiles, activeLocks: [] } });
  return { runtime, seen: collectEvents(runtime), setNow: (value: number) => { now = value; } };
}
function population(runtime: SimulationRuntime): number | undefined {
  const tile = runtime.exportSnapshotSections().initialState.tiles.find(tile => tile.x === 10 && tile.y === 10);
  return tile?.town?.population;
}

describe("Forced Ancillarification through the real runtime", () => {
  it("debits residents, grants exactly 100 immediate MP above cap, and recovers both from the event journal", async () => {
    const { runtime, seen } = setup();
    const before = runtime.exportSnapshotSections().initialState;
    runtime.submitCommand(command("1")); await flush();
    expect(seen.filter(event => event.eventType === "COMMAND_REJECTED")).toEqual([]);
    expect(population(runtime)).toBe(19_600);
    const after = runtime.exportSnapshotSections().initialState;
    expect(after.players?.find(player => player.id === "p")?.manpower).toBe(5100);
    const cooldown = 1000 + FORCED_ANCILLARIFICATION_COOLDOWN_MS;
    expect(after.tiles.find(tile => tile.town)?.town?.forcedAncillarificationCooldownUntil).toBe(cooldown);
    const recovered = applySimulationEventsToRecoveredState(before, seen.filter(event => event.eventType !== "PLAYER_MESSAGE"));
    expect(recovered.tiles.find(tile => tile.town)?.town).toMatchObject({ population: 19_600, forcedAncillarificationCooldownUntil: cooldown });
    expect(recovered.players?.find(player => player.id === "p")).toMatchObject({ manpower: 5100, waystationManpowerOverflow: after.players?.find(player => player.id === "p")?.waystationManpowerOverflow });
    runtime.submitCommand(command("1")); await flush();
    expect(population(runtime)).toBe(19_600);
  });
  it("shares a cooldown across factories, retains it in snapshots, and becomes available at expiry", async () => {
    const { runtime, seen, setNow } = setup([town(), factory(), factory(9)]);
    runtime.submitCommand(command("1")); await flush();
    runtime.submitCommand(command("2", 9)); await flush();
    expect(population(runtime)).toBe(19_600);
    expect(seen.some(event => event.eventType === "COMMAND_REJECTED" && event.commandId === "2")).toBe(true);
    const snapshot = runtime.exportSnapshotSections().initialState;
    const restarted = new SimulationRuntime({ now: () => 2000, scheduleAfter: () => {}, seedTiles: new Map(), initialState: snapshot });
    const restartedEvents = collectEvents(restarted);
    restarted.submitCommand(command("3", 9)); await flush();
    expect(restartedEvents.some(event => event.eventType === "COMMAND_REJECTED")).toBe(true);
    setNow(1000 + FORCED_ANCILLARIFICATION_COOLDOWN_MS);
    runtime.submitCommand(command("4", 9)); await flush();
    expect(population(runtime)).toBe(19_208);
  });
  it("rejects absent, foreign, unfinished, inactive and resource-starved factories or too-small towns", async () => {
    const cases: Array<{ tiles: DomainTileState[]; food?: number }> = [
      { tiles: [town()] },
      { tiles: [town(), { ...factory(), ownerId: "enemy" }] },
      { tiles: [town(), { ...factory(), economicStructure: { ...factory().economicStructure!, status: "under_construction" } }] },
      { tiles: [town(), { ...factory(), economicStructure: { ...factory().economicStructure!, status: "inactive" } }] },
      { tiles: [town(), factory()], food: 0 },
      { tiles: [town(10_000), factory()] },
      { tiles: [factory()] }
    ];
    for (const entry of cases) {
      const { runtime, seen } = setup(entry.tiles, entry.food);
      const before = population(runtime);
      runtime.submitCommand(command("1")); await flush();
      expect(seen.some(event => event.eventType === "COMMAND_REJECTED")).toBe(true);
      expect(population(runtime)).toBe(before);
      expect(runtime.exportSnapshotSections().initialState.players?.find(player => player.id === "p")?.manpower).toBe(5000);
    }
  });
  it("reduces a city tier when the sacrifice takes it below its population threshold", async () => {
    const city = town(100_000); city.town!.populationTier = "CITY";
    const { runtime } = setup([city, factory()]);
    runtime.submitCommand(command("1")); await flush();
    expect(runtime.exportSnapshotSections().initialState.tiles.find(tile => tile.town)?.town).toMatchObject({ population: 98_000, populationTier: "TOWN" });
  });
});
