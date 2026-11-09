import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResourceSupplyAgreement } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

const agreement = (id: string, proposerId: string, targetId: string): ResourceSupplyAgreement =>
  ({ id, proposerId, targetId, proposerGives: { FOOD: 1 }, targetGives: {}, startedAt: 1 });

const build = (target: DomainTileState) => new SimulationRuntime({
  now: () => 1_000,
  seedTiles: new Map(),
  initialPlayers: new Map(["player-1", "player-2", "player-3"].map(id => [id, buildPlayer(id, { manpower: 1_000 })])),
  initialState: {
    activeLocks: [],
    tiles: [
      { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
        muster: { ownerId: "player-1", amount: 999, mode: "HOLD", updatedAt: 0 } },
      target,
      { x: 30, y: 30, terrain: "LAND", ownerId: "player-3", ownershipState: "SETTLED" }
    ],
    resourceSupplyAgreements: [
      agreement("p1-to-p2", "player-1", "player-2"),
      agreement("p2-to-p1", "player-2", "player-1"),
      agreement("p1-to-p3", "player-1", "player-3"),
      agreement("p3-to-p2", "player-3", "player-2")
    ]
  }
});

const attack = async (runtime: SimulationRuntime) => {
  runtime.submitCommand({ commandId: "attack-1", sessionId: "s", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
    type: "ATTACK", payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 }) });
  await Promise.resolve(); await Promise.resolve();
};
const ids = (runtime: SimulationRuntime) => runtime.exportSnapshotSections().initialState.resourceSupplyAgreements?.map(row => row.id).sort();

describe("attacking a House ends supply trades between the two", () => {
  afterEach(() => { vi.useRealTimers(); });
  it("ends both directions on a frontier-tile attack and leaves unrelated trades alone", async () => {
    vi.useFakeTimers();
    const runtime = build({ x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" });
    const events = collectEvents(runtime);
    await attack(runtime);
    expect(events.some(e => e.eventType === "COMMAND_ACCEPTED" && e.commandId === "attack-1")).toBe(true);
    expect(ids(runtime)).toEqual(["p1-to-p3", "p3-to-p2"]);
    const cancelled = events.filter(e => e.eventType === "PLAYER_MESSAGE" && e.messageType === "RESOURCE_SUPPLY_CHANGED")
      .map(e => (JSON.parse((e as { payloadJson: string }).payloadJson) as { action: string; agreement: { id: string } }))
      .filter(m => m.action === "cancelled").map(m => m.agreement.id).sort();
    expect(cancelled).toEqual(["p1-to-p2", "p2-to-p1"]);
  });
  it("leaves trades untouched when the target is a barbarian tile", async () => {
    vi.useFakeTimers();
    const runtime = build({ x: 10, y: 11, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" });
    const events = collectEvents(runtime);
    await attack(runtime);
    expect(events.some(e => e.eventType === "COMMAND_ACCEPTED" && e.commandId === "attack-1")).toBe(true);
    expect(ids(runtime)).toEqual(["p1-to-p2", "p1-to-p3", "p2-to-p1", "p3-to-p2"]);
  });
});
