import { describe, expect, it } from "vitest";

import type { DomainPlayer } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";

import { handleDiplomacySettlementCommand, type RuntimeDiplomacySettlementContext } from "./runtime-diplomacy-settlement-command.js";

const player = (id: string, points: number, shard = 0): DomainPlayer => ({
  id,
  name: id === "p1" ? "Beejac" : "Milo",
  isAi: false,
  points,
  manpower: 0,
  techIds: new Set(),
  allies: new Set(),
  strategicResources: { SHARD: shard }
});

const command = (payload: unknown): CommandEnvelope => ({
  commandId: "diplomacy-settle:1",
  sessionId: "system-runtime:social",
  playerId: "p2",
  clientSeq: 0,
  issuedAt: 0,
  type: "SETTLE_DIPLOMACY_TERMS",
  payloadJson: JSON.stringify(payload)
});

const setup = (p1: DomainPlayer, p2: DomainPlayer) => {
  const events: SimulationEvent[] = [];
  const messages: Array<{ playerId: string; payload: Record<string, unknown> }> = [];
  const context = {
    players: new Map([[p1.id, p1], [p2.id, p2]]),
    emitEvent: (event: SimulationEvent) => events.push(event),
    emitPlayerMessage: (cmd: { playerId: string }, payload: Record<string, unknown>) => messages.push({ playerId: cmd.playerId, payload })
  };
  return { context, events, messages };
};

describe("SETTLE_DIPLOMACY_TERMS", () => {
  it("moves coin and Shards both ways and tells both players their new balances", () => {
    const p1 = player("p1", 100, 3);
    const p2 = player("p2", 40, 0);
    const { context, events, messages } = setup(p1, p2);

    handleDiplomacySettlementCommand(
      context,
      command({ proposerId: "p1", targetId: "p2", proposerPays: { gold: 60, shard: 2 }, targetPays: { gold: 10, shard: 0 } })
    );

    expect(p1.points).toBe(50);
    expect(p2.points).toBe(90);
    expect(p1.strategicResources?.SHARD).toBe(1);
    expect(p2.strategicResources?.SHARD).toBe(2);
    expect(messages.map((entry) => entry.playerId)).toEqual(["p1", "p2"]);
    expect(events).toEqual([{ eventType: "COMMAND_RESOLVED", commandId: "diplomacy-settle:1", playerId: "p2" }]);
  });

  it("rejects without moving anything when either side can't pay", () => {
    const p1 = player("p1", 100);
    const p2 = player("p2", 5);
    const { context, events } = setup(p1, p2);

    handleDiplomacySettlementCommand(
      context,
      command({ proposerId: "p1", targetId: "p2", proposerPays: { gold: 50, shard: 0 }, targetPays: { gold: 20, shard: 0 } })
    );

    expect(p1.points).toBe(100);
    expect(p2.points).toBe(5);
    expect(events).toEqual([
      expect.objectContaining({ eventType: "COMMAND_REJECTED", code: "DIPLOMACY_SETTLEMENT_INSUFFICIENT", message: "Milo no longer has 20 coin" })
    ]);
  });

  it("rejects malformed amounts", () => {
    const { context, events } = setup(player("p1", 100), player("p2", 100));
    handleDiplomacySettlementCommand(
      context,
      command({ proposerId: "p1", targetId: "p2", proposerPays: { gold: -5, shard: 0 }, targetPays: { gold: 0, shard: 0 } })
    );
    expect(events).toEqual([expect.objectContaining({ eventType: "COMMAND_REJECTED", code: "BAD_COMMAND" })]);
  });
});


describe("resource-backed settlement", () => {
  const terms = { proposerId: "p1", targetId: "p2", proposerPays: { gold: 3, shard: 0, resources: { FOOD: 2 } }, targetPays: { gold: 0, shard: 0 }, supplyDurationHours: 24 };
  it("refuses unsupported resource trading before moving currency", () => {
    const a = player("p1", 10), b = player("p2", 20), { context, events } = setup(a, b);
    handleDiplomacySettlementCommand(context, command(terms));
    expect(events.at(-1)).toMatchObject({ eventType: "COMMAND_REJECTED", code: "RESOURCE_TRADING_UNAVAILABLE" });
    expect([a.points, b.points]).toEqual([10, 20]);
  });
  it("registers the renewable commitment for the chosen term, then moves currency", () => {
    const a = player("p1", 10), b = player("p2", 20), { context, events } = setup(a, b);
    const enhanced: RuntimeDiplomacySettlementContext = { ...context, now: () => 100, resourceSupply: {
      create: agreement => {
        expect(agreement).toMatchObject({ id: "diplomacy-settle:1", proposerGives: { FOOD: 2 }, startedAt: 100 });
        expect(agreement.expiresAt).toBeUndefined();
        expect([a.points, b.points]).toEqual([10, 20]);
        return { ok: true };
      }, cancelRefunded: () => { throw new Error("not a refund"); }
    } };
    handleDiplomacySettlementCommand(enhanced, command(terms));
    expect([a.points, b.points]).toEqual([7, 23]);
    expect(events.at(-1)).toMatchObject({ eventType: "COMMAND_RESOLVED" });
  });
  it("keeps both balances unchanged when the promised supply is no longer free", () => {
    const a = player("p1", 10), b = player("p2", 20), { context, events } = setup(a, b);
    const enhanced: RuntimeDiplomacySettlementContext = { ...context, resourceSupply: {
      create: () => ({ ok: false, message: "No free FOOD supply." }), cancelRefunded: () => undefined
    } };
    handleDiplomacySettlementCommand(enhanced, command(terms));
    expect([a.points, b.points]).toEqual([10, 20]);
    expect(events.at(-1)).toMatchObject({ code: "DIPLOMACY_SETTLEMENT_RESOURCE_SUPPLY" });
  });
  it("releases the original promise on refund instead of creating an inverse agreement", () => {
    const a = player("p1", 10), b = player("p2", 20), { context } = setup(a, b);
    const cancelled: string[] = [];
    const enhanced: RuntimeDiplomacySettlementContext = { ...context, resourceSupply: {
      create: () => { throw new Error("refund cannot create a new agreement"); },
      cancelRefunded: id => { cancelled.push(id); }
    } };
    handleDiplomacySettlementCommand(enhanced, command({ ...terms, refundOf: "original", proposerPays: terms.targetPays, targetPays: terms.proposerPays }));
    expect(cancelled).toEqual(["original"]);
    expect([a.points, b.points]).toEqual([13, 17]);
  });
});
