import type { DomainPlayer } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";
import { applyMusterFlagCapture, type MusterCaptureContext } from "./muster-capture.js";

const player = (id: string, manpower: number, isAi = false): DomainPlayer => ({ id, isAi, points: 0, manpower, techIds: new Set(), allies: new Set() });

const harness = (players: DomainPlayer[], cap = 1_000) => {
  const messages: Array<{ playerId: string; messageType: string }> = [];
  const impacts: Array<{ kind: string; playerId: string }> = [];
  const context: MusterCaptureContext = {
    players: new Map(players.map((p) => [p.id, p])),
    playerManpowerCap: () => cap,
    now: () => 1_000,
    emitEvent: (event) => { messages.push({ playerId: event.playerId, messageType: event.messageType }); },
    recordPersonalImpact: (event) => { impacts.push(event); }
  };
  return { context, messages, impacts };
};

const flag = (ownerId: string, amount: number) => ({ ownerId, amount, mode: "HOLD" as const, updatedAt: 0 });

describe("applyMusterFlagCapture", () => {
  it("destroys a flag barbarians take: nobody gains, the owner still learns what they lost", () => {
    const owner = player("p1", 0);
    const { context, messages, impacts } = harness([owner]);
    const result = applyMusterFlagCapture(context, { commandId: "c", captorId: "barbarian-1", x: 1, y: 2, muster: flag("p1", 40) });
    expect(result).toEqual({ amount: 40, gained: 0, flagOwnerId: "p1" });
    expect(messages).toEqual([{ playerId: "p1", messageType: "MUSTER_LOST" }]);
    expect(impacts.map((i) => i.kind)).toEqual(["MUSTER_LOST"]);
  });

  it("credits an AI captor but sends no player message to AI empires", () => {
    const captor = player("ai-1", 0, true);
    const owner = player("ai-2", 0, true);
    const { context, messages, impacts } = harness([captor, owner]);
    applyMusterFlagCapture(context, { commandId: "c", captorId: "ai-1", x: 1, y: 2, muster: flag("ai-2", 25) });
    expect(captor.manpower).toBe(25);
    expect(messages).toEqual([]);
    expect(impacts.map((i) => i.kind)).toEqual(["MUSTER_CAPTURED", "MUSTER_LOST"]);
  });

  it("ignores an empty flag and the captor's own flag", () => {
    const captor = player("p1", 5);
    const { context, messages } = harness([captor, player("p2", 0)]);
    expect(applyMusterFlagCapture(context, { commandId: "c", captorId: "p1", x: 0, y: 0, muster: flag("p2", 0) })).toBeUndefined();
    expect(applyMusterFlagCapture(context, { commandId: "c", captorId: "p1", x: 0, y: 0, muster: flag("p1", 30) })).toBeUndefined();
    expect(captor.manpower).toBe(5);
    expect(messages).toEqual([]);
  });

  it("keeps a captor's reserve overflow: the gain clamps to cap plus overflow, not the bare cap", () => {
    const captor = { ...player("p1", 150), waystationManpowerOverflow: 50 };
    const { context } = harness([captor, player("p2", 0)], 100);
    const result = applyMusterFlagCapture(context, { commandId: "c", captorId: "p1", x: 0, y: 0, muster: flag("p2", 30) });
    expect(captor.manpower).toBe(150);
    expect(result?.gained).toBe(0);
  });
});
