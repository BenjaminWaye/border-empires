import { describe, expect, it } from "vitest";

import type { DomainPlayer } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";

import { handleDiplomacySettlementCommand } from "./runtime-diplomacy-settlement-command.js";

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
