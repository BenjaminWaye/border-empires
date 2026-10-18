import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { AETHER_LANCE_COOLDOWN_MS } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents, afcModuleFixtureTile } from "../runtime/runtime.test-helpers.js";
import { applySimulationEventsToRecoveredState } from "../event-recovery/event-recovery.js";

const command = (type: CommandEnvelope["type"], payload: object, id = type): CommandEnvelope => ({ type, payloadJson: JSON.stringify(payload), playerId: "p", commandId: id, sessionId: "afc-test", clientSeq: 1, issuedAt: 1000 });
const tower = (x: number, ownerId: string): DomainTileState => ({ x, y: 10, terrain: "LAND", ownerId, ownershipState: "SETTLED", observatory: { ownerId, status: "active" } });
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

describe("AFC active abilities in the real runtime", () => {
  it("charges paid recruitment once, retains overflow, and journals it for restart", async () => {
    const actor = buildPlayer("p", { afcUpgradeRuleset: "afc-v1", domainIds: new Set(["afc-exchequer-4"]), points: 1000, manpower: 300 });
    const runtime = new SimulationRuntime({ now: () => 1000, scheduleAfter: () => {}, seedTiles: new Map(), initialPlayers: new Map([["p", actor]]), initialState: { tiles: [afcModuleFixtureTile("p")], activeLocks: [] } });
    const seen = collectEvents(runtime), before = runtime.exportSnapshotSections().initialState;
    runtime.submitCommand(command("RECRUIT_ANCILLARIES", { coin: 200 })); await flush();
    const after = runtime.exportSnapshotSections().initialState.players!.find(p => p.id === "p")!;
    expect(after.points).toBe(800);
    expect(after.manpower).toBeGreaterThan(300);
    expect(after.waystationManpowerOverflow).toBeGreaterThan(0);
    const replayed = applySimulationEventsToRecoveredState(before, seen.filter(event => event.eventType !== "PLAYER_MESSAGE"));
    expect(replayed.players?.find(p => p.id === "p")).toMatchObject({ points: 800, manpower: after.manpower, waystationManpowerOverflow: after.waystationManpowerOverflow });
    runtime.submitCommand(command("RECRUIT_ANCILLARIES", { coin: 200 })); await flush();
    expect(runtime.exportState().players.find(p => p.id === "p")?.points).toBe(800);
  });
  it("rejects unavailable or unaffordable recruitment without spending Coin", async () => {
    for (const domains of [[], ["afc-exchequer-4"]]) {
      const runtime = new SimulationRuntime({ now: () => 1000, scheduleAfter: () => {}, seedTiles: new Map(), initialPlayers: new Map([["p", buildPlayer("p", { points: 1, domainIds: new Set(domains) })]]), initialState: { tiles: [afcModuleFixtureTile("p")], activeLocks: [] } });
      const seen = collectEvents(runtime);
      runtime.submitCommand(command("RECRUIT_ANCILLARIES", { coin: 2 })); await flush();
      expect(seen.some(event => event.eventType === "COMMAND_REJECTED")).toBe(true);
      expect(runtime.exportState().players.find(p => p.id === "p")?.points).toBe(1);
    }
  });
  it("suppresses a hostile tower through its own shield and uses the configured caster cooldown", async () => {
    const actor = buildPlayer("p", { afcUpgradeRuleset: "afc-v1", domainIds: new Set(["afc-oracle-4", "afc-oracle-2"]), techIds: new Set(["crystal-lattices"]), waystationResourceSlotBonus: { CRYSTAL: 10 } });
    const enemy = buildPlayer("e", { waystationResourceSlotBonus: { CRYSTAL: 10 } });
    const runtime = new SimulationRuntime({ now: () => 1000, scheduleAfter: () => {}, seedTiles: new Map(), initialPlayers: new Map([["p", actor], ["e", enemy]]), initialState: { tiles: [afcModuleFixtureTile("p"), afcModuleFixtureTile("e"), tower(10, "p"), tower(15, "e")], activeLocks: [] } });
    const before = runtime.exportSnapshotSections().initialState;
    const seen = collectEvents(runtime);
    runtime.submitCommand(command("SUPPRESS_AETHER_TOWER", { x: 15, y: 10 })); await flush();
    expect(seen.filter(event => event.eventType === "COMMAND_REJECTED")).toEqual([]);
    const state = runtime.exportState();
    expect(JSON.parse(state.tiles.find(t => t.x === 15)!.observatoryJson!).suppressedUntil).toBe(301_000);
    expect(JSON.parse(state.tiles.find(t => t.x === 10)!.observatoryJson!).cooldownUntil).toBe(1000 + AETHER_LANCE_COOLDOWN_MS * 0.5);
    const recovered = applySimulationEventsToRecoveredState(before, seen.filter(event => event.eventType !== "PLAYER_MESSAGE"));
    expect(recovered.tiles.find(tile => tile.x === 15)?.observatory?.suppressedUntil).toBe(301_000);
    expect(recovered.tiles.find(tile => tile.x === 10)?.observatory?.cooldownUntil).toBe(1000 + AETHER_LANCE_COOLDOWN_MS * 0.5);
  });
});
