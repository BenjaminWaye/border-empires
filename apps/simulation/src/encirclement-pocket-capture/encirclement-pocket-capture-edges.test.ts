import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";

import { applyEncirclement, type RuntimeEncirclementApplicationContext } from "../runtime-encirclement-application.js";
import { applyCombatEncirclement } from "../runtime-lock-resolution-encirclement.js";
import type { ActiveAetherBridgeView, LockRecord, SimulationTileWireDelta } from "../runtime-types.js";

const frontier = (x: number, y: number, ownerId: string, extra: Partial<DomainTileState> = {}): DomainTileState =>
  ({ x, y, terrain: "LAND", ownerId, ownershipState: "FRONTIER", ...extra }) as DomainTileState;
const settled = (x: number, y: number, ownerId: string): DomainTileState =>
  ({ x, y, terrain: "LAND", ownerId, ownershipState: "SETTLED" }) as DomainTileState;

const harness = (
  list: DomainTileState[],
  options: { bridges?: ActiveAetherBridgeView[]; seaLanes?: Map<string, string[]>; lockedKeys?: string[] } = {}
) => {
  const tiles = new Map(list.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const events: SimulationEvent[] = [];
  const context: RuntimeEncirclementApplicationContext = {
    tiles,
    now: () => 1_000,
    activeAetherBridgesForPlayer: (playerId) => (options.bridges ?? []).filter((bridge) => bridge.ownerId === playerId),
    seaLaneNeighborKeysByTileKey: options.seaLanes ?? new Map(),
    replaceTileState: (key, tile) => void tiles.set(key, tile),
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y, ownerId: tile.ownerId }) as SimulationTileWireDelta,
    emitEvent: (event) => void events.push(event),
    runtimeLogInfo: () => {},
    registerFrontierAutoHeal: () => {},
    hasTileLock: (key) => (options.lockedKeys ?? []).includes(key)
  };
  return { tiles, events, context };
};

// player-2's tendril 12..15,10 hangs off settled 16,10; player-1 holds 14,10 now.
const severedTendril = (extra: Partial<DomainTileState> = {}) => [
  settled(16, 10, "player-2"),
  frontier(15, 10, "player-2"),
  frontier(14, 10, "player-1"),
  frontier(13, 10, "player-2", extra),
  frontier(12, 10, "player-2"),
  settled(14, 11, "player-1")
];

describe("encirclement pocket capture — edges", () => {
  it("does not hand over land hanging on the cut tile only through the loser's Aether bridge", () => {
    const bridge: ActiveAetherBridgeView = { bridgeId: "b", ownerId: "player-2", from: { x: 14, y: 10 }, to: { x: 30, y: 30 }, startedAt: 0, endsAt: 99_999 };
    const { tiles, context } = harness([...severedTendril(), frontier(30, 30, "player-2"), frontier(31, 30, "player-2")], { bridges: [bridge] });

    applyEncirclement(context, ["14,10"], "player-2", "cmd", { claimantId: "player-1" });

    expect(tiles.get("13,10")?.ownerId).toBe("player-1");
    expect(tiles.get("30,30")?.ownerId).toBeUndefined();
    expect(tiles.get("31,30")?.ownerId).toBeUndefined();
  });

  it("does not hand over beach landings across a captured dock's sea lane", () => {
    const tiles = [
      settled(10, 9, "player-1"),
      frontier(10, 10, "player-1", { dockId: "dock-a" } as Partial<DomainTileState>),
      frontier(40, 40, "player-2")
    ];
    const seaLanes = new Map([["10,10", ["40,40"]], ["40,40", ["10,10"]]]);
    const h = harness(tiles, { seaLanes });

    applyEncirclement(h.context, ["10,10"], "player-2", "cmd", { claimantId: "player-1" });

    expect(h.tiles.get("40,40")?.ownerId).toBeUndefined();
  });

  it("leaves a pocket tile held by an in-flight lock to the neutral release", () => {
    const { tiles, context } = harness(severedTendril(), { lockedKeys: ["12,10"] });

    applyEncirclement(context, ["14,10"], "player-2", "cmd", { claimantId: "player-1" });

    expect(tiles.get("13,10")?.ownerId).toBe("player-1");
    expect(tiles.get("12,10")?.ownerId).toBeUndefined();
  });

  it("clears a captured pocket tile's muster flag on the wire and drops breach shock", () => {
    const muster = { ownerId: "player-2", amount: 5, mode: "HOLD", updatedAt: 0 };
    const { tiles, events, context } = harness(severedTendril({ muster, breachShockUntil: 9_999 } as Partial<DomainTileState>));

    applyEncirclement(context, ["14,10"], "player-2", "cmd", { claimantId: "player-1" });

    expect(tiles.get("13,10")?.breachShockUntil).toBeUndefined();
    const batches = events.filter((event): event is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> => event.eventType === "TILE_DELTA_BATCH");
    const own = batches.find((event) => event.playerId === "player-2")?.tileDeltas.find((delta) => delta.x === 13);
    expect(own?.musterJson).toBe("");
    const broadcast = batches.find((event) => event.playerId === "__broadcast__");
    expect(broadcast?.tileDeltas).toEqual([{ x: 13, y: 10, ownerId: "player-1", ownershipState: "FRONTIER", musterJson: "" }]);
  });
});

describe("applyCombatEncirclement claimant", () => {
  const lock = { commandId: "c", playerId: "attacker", actionType: "ATTACK", targetKey: "5,5", originKey: "4,5" } as LockRecord;
  const record = (attackerWon: boolean, originLost: boolean) => {
    const calls: Array<{ pid: string; claimantId: string | undefined }> = [];
    applyCombatEncirclement(
      {
        applyEncirclement: (_keys, pid, _cmd, options) => void calls.push({ pid, claimantId: options?.claimantId }),
        applyEncirclementForExpand: () => {}
      },
      lock, attackerWon, originLost, "defender"
    );
    return calls;
  };

  it("gives the defender's cut-off frontier to the attacker that took the target", () => {
    expect(record(true, false)).toEqual([{ pid: "defender", claimantId: "attacker" }]);
  });

  it("gives the attacker's cut-off frontier to the defender that took its origin, and the defender no claimant", () => {
    expect(record(false, true)).toEqual([
      { pid: "attacker", claimantId: "defender" },
      { pid: "defender", claimantId: undefined }
    ]);
  });
});
