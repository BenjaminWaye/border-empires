import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { AFC_SPECIALIZATION_BALANCE } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents, afcModuleFixtureTile } from "../runtime/runtime.test-helpers.js";

let seq = 0;
const command = (playerId: string, type: CommandEnvelope["type"], payload: object, id: string): CommandEnvelope =>
  ({ type, payloadJson: JSON.stringify(payload), playerId, commandId: id, sessionId: "afc-hijack-test", clientSeq: ++seq, issuedAt: 1000 });
const tower = (x: number, ownerId: string, shotsUsedAt?: number[]): DomainTileState =>
  ({ x, y: 10, terrain: "LAND", ownerId, ownershipState: "SETTLED", observatory: { ownerId, status: "active", ...(shotsUsedAt ? { shotsUsedAt } : {}) } });
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function fixture(enemyShotsUsed: number[] | undefined, enemyDomains: string[] = []) {
  let now = 1000;
  const actor = buildPlayer("p", { afcUpgradeRuleset: "afc-v1", domainIds: new Set(["afc-oracle-5"]), waystationResourceSlotBonus: { CRYSTAL: 10 } });
  const enemy = buildPlayer("e", { afcUpgradeRuleset: "afc-v1", domainIds: new Set(enemyDomains), waystationResourceSlotBonus: { CRYSTAL: 10 } });
  const runtime = new SimulationRuntime({ now: () => now, scheduleAfter: () => {}, seedTiles: new Map(), initialPlayers: new Map([["p", actor], ["e", enemy]]),
    initialState: { tiles: [afcModuleFixtureTile("p"), afcModuleFixtureTile("e"), tower(10, "p"), tower(15, "e", enemyShotsUsed), tower(22, "e")], activeLocks: [] } });
  const seen = collectEvents(runtime);
  const observatory = (x: number) => JSON.parse(runtime.exportState().tiles.find(t => t.x === x && t.y === 10)!.observatoryJson!);
  const owner = (x: number) => runtime.exportState().tiles.find(t => t.x === x && t.y === 10)?.ownerId;
  return { runtime, seen, observatory, owner, setNow: (value: number) => { now = value; } };
}
const emptied = [100, 200, 300];

describe("Resonance Hijack in the real runtime", () => {
  it("refuses a tower that still has a shot, spending nothing", async () => {
    const { runtime, seen, observatory } = fixture(undefined);
    runtime.submitCommand(command("p", "HIJACK_AETHER_TOWER", { x: 15, y: 10 }, "hijack")); await flush();
    expect(seen.some(event => event.eventType === "COMMAND_REJECTED")).toBe(true);
    expect(observatory(15).hijack).toBeUndefined();
    expect(observatory(10).shotsUsedAt).toBeUndefined();
  });

  it("locks an emptied tower, reveals the caster to its owner, and takes it when the 10 minutes run out", async () => {
    const { runtime, seen, observatory, owner, setNow } = fixture(emptied);
    runtime.submitCommand(command("p", "HIJACK_AETHER_TOWER", { x: 15, y: 10 }, "hijack")); await flush();
    expect(seen.filter(event => event.eventType === "COMMAND_REJECTED")).toEqual([]);
    const endsAt = 1000 + AFC_SPECIALIZATION_BALANCE.hijackTakeoverMs;
    expect(observatory(15)).toMatchObject({ suppressedUntil: endsAt, hijack: { byPlayerId: "p", casterX: 10, casterY: 10, endsAt } });
    expect(observatory(10).shotsUsedAt).toEqual([1000]);
    const alert = seen.find(event => event.eventType === "PLAYER_MESSAGE" && event.playerId === "e" && event.messageType === "AETHER_HIJACK_ALERT");
    expect(alert && "payloadJson" in alert ? JSON.parse(alert.payloadJson) : undefined).toMatchObject({ casterX: 10, casterY: 10, endsAt });
    expect(runtime.exportState().players.find(p => p.id === "p")?.afcCampaign?.hijackReadyAt).toBe(1000 + AFC_SPECIALIZATION_BALANCE.hijackCooldownMs);

    runtime.submitCommand(command("p", "HIJACK_AETHER_TOWER", { x: 15, y: 10 }, "again")); await flush();
    expect(seen.filter(event => event.eventType === "COMMAND_REJECTED")).toHaveLength(1);

    setNow(endsAt - 1); runtime.tickAetherShields(endsAt - 1);
    expect(owner(15)).toBe("e");
    setNow(endsAt); runtime.tickAetherShields(endsAt);
    expect(owner(15)).toBe("p");
    expect(observatory(15)).toMatchObject({ ownerId: "p", status: "active" });
    expect(observatory(15).hijack).toBeUndefined();
    expect(observatory(15).suppressedUntil).toBeUndefined();
  });

  it("fails and unlocks the target when the owner suppresses the casting tower", async () => {
    const { runtime, seen, observatory, owner, setNow } = fixture(emptied, ["afc-oracle-4"]);
    runtime.submitCommand(command("p", "HIJACK_AETHER_TOWER", { x: 15, y: 10 }, "hijack")); await flush();
    runtime.submitCommand(command("e", "SUPPRESS_AETHER_TOWER", { x: 10, y: 10 }, "counter")); await flush();
    expect(seen.filter(event => event.eventType === "COMMAND_REJECTED")).toEqual([]);
    setNow(2000); runtime.tickAetherShields(2000);
    expect(owner(15)).toBe("e");
    expect(observatory(15).hijack).toBeUndefined();
    expect(observatory(15).suppressedUntil).toBeUndefined();
    const outcome = seen.find(event => event.eventType === "PLAYER_MESSAGE" && event.playerId === "p" && "payloadJson" in event && event.payloadJson.includes("AFC_HIJACK_OUTCOME"));
    expect(outcome && "payloadJson" in outcome ? JSON.parse(outcome.payloadJson).status : undefined).toBe("failed");
  });
});
