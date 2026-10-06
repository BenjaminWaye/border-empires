import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import {
  holdDevelopmentForAttack,
  releaseDevelopmentHold,
  scheduleStructureCompletion,
  structureTypeForField,
  tileHasPausedConstruction,
  type AttackDevelopmentHoldContext
} from "./attack-development-hold.js";

const TILE = "5,5";

const makeContext = (tile: DomainTileState, nowRef: { now: number }) => {
  const tiles = new Map<string, DomainTileState>([[TILE, tile]]);
  const events: SimulationEvent[] = [];
  const timers: Array<{ delayMs: number; run: () => void }> = [];
  const completed: Array<{ structureType: string; commandId: string }> = [];
  const cancelled: Array<{ attackerId: string; commandId: string }> = [];
  const ctx: AttackDevelopmentHoldContext = {
    now: () => nowRef.now,
    scheduleAfter: (delayMs, run) => timers.push({ delayMs, run }),
    tiles,
    completeStructureBuild: (_tileKey, _ownerId, structureType, commandId) => completed.push({ structureType, commandId }),
    replaceTileState: (tileKey, next) => tiles.set(tileKey, next),
    tileDeltaFromState: (next) => ({ x: next.x, y: next.y }),
    emitEvent: (event) => events.push(event),
    emitPlayerStateUpdate: () => {},
    cancelPendingSettlementForAttack: (_tileKey, attackerId, commandId) => {
      cancelled.push({ attackerId, commandId });
      return false;
    }
  };
  return { ctx, tiles, events, timers, completed, cancelled };
};

const base = { x: 5, y: 5, terrain: "LAND", ownerId: "defender", ownershipState: "SETTLED" } as const;

// One tile per structure field; every one must pause and resume the same way.
const CASES: Array<{ name: string; field: "fort" | "observatory" | "siegeOutpost" | "economicStructure"; tile: (completesAt: number) => DomainTileState; type: string }> = [
  { name: "fort", field: "fort", type: "TITANIUM_BASTION", tile: (completesAt) => ({ ...base, fort: { ownerId: "defender", status: "under_construction", variant: "TITANIUM_BASTION", upgradingFrom: "FORT", completesAt } }) },
  { name: "observatory", field: "observatory", type: "OBSERVATORY", tile: (completesAt) => ({ ...base, observatory: { ownerId: "defender", status: "under_construction", completesAt } }) },
  { name: "siege outpost", field: "siegeOutpost", type: "SIEGE_TOWER", tile: (completesAt) => ({ ...base, siegeOutpost: { ownerId: "defender", status: "under_construction", variant: "SIEGE_TOWER", completesAt } }) },
  { name: "economic structure", field: "economicStructure", type: "MINTWORKS", tile: (completesAt) => ({ ...base, economicStructure: { ownerId: "defender", type: "MINTWORKS", status: "under_construction", completesAt } }) }
];

describe.each(CASES)("attack development hold: $name", ({ field, tile, type }) => {
  it("pauses on attack, then resumes with the deadline shifted by the time spent paused", () => {
    const clock = { now: 1_000 };
    const { ctx, tiles, timers } = makeContext(tile(61_000), clock);

    holdDevelopmentForAttack(ctx, { targetKey: TILE, attackerId: "attacker", commandId: "atk" });
    expect(tiles.get(TILE)?.[field]).toMatchObject({ status: "under_construction", pausedAt: 1_000, completesAt: 61_000 });
    expect(tileHasPausedConstruction(tiles.get(TILE))).toBe(true);

    clock.now = 31_000;
    releaseDevelopmentHold(ctx, TILE, "atk");
    expect(tiles.get(TILE)?.[field]).toMatchObject({ status: "under_construction", completesAt: 91_000 });
    expect(tiles.get(TILE)?.[field]?.pausedAt).toBeUndefined();
    expect(timers.at(-1)?.delayMs).toBe(60_000);
    expect(tileHasPausedConstruction(tiles.get(TILE))).toBe(false);
  });

  it("keeps a fort upgrade's standing tier and structure type through the cycle", () => {
    const clock = { now: 0 };
    const { ctx, tiles, timers, completed } = makeContext(tile(10_000), clock);
    holdDevelopmentForAttack(ctx, { targetKey: TILE, attackerId: "attacker", commandId: "atk" });
    clock.now = 5_000;
    releaseDevelopmentHold(ctx, TILE, "atk");
    clock.now = 15_000;
    timers.at(-1)?.run();
    expect(completed).toEqual([{ structureType: type, commandId: "attack-resume:atk" }]);
    expect(tiles.get(TILE)?.fort?.upgradingFrom).toBe(field === "fort" ? "FORT" : undefined);
    expect(structureTypeForField(tiles.get(TILE)!, field)).toBe(type);
  });
});

describe("attack development hold: edge cases", () => {
  it("ignores an attacker's own tile and unowned tiles", () => {
    const clock = { now: 1 };
    const own = makeContext({ ...base, ownerId: "attacker", economicStructure: { ownerId: "attacker", type: "MINTWORKS", status: "under_construction", completesAt: 99 } }, clock);
    holdDevelopmentForAttack(own.ctx, { targetKey: TILE, attackerId: "attacker", commandId: "atk" });
    expect(tileHasPausedConstruction(own.tiles.get(TILE))).toBe(false);
    expect(own.cancelled).toHaveLength(0);

    const { ownerId: _owner, ...neutral } = base;
    const none = makeContext({ ...neutral }, clock);
    holdDevelopmentForAttack(none.ctx, { targetKey: TILE, attackerId: "attacker", commandId: "atk" });
    expect(none.events).toHaveLength(0);
  });

  it("does not re-stamp an already paused structure, and does not pause active ones", () => {
    const clock = { now: 500 };
    const paused = makeContext({ ...base, observatory: { ownerId: "defender", status: "under_construction", completesAt: 9_000, pausedAt: 100 } }, clock);
    holdDevelopmentForAttack(paused.ctx, { targetKey: TILE, attackerId: "attacker", commandId: "atk" });
    expect(paused.tiles.get(TILE)?.observatory?.pausedAt).toBe(100);
    expect(paused.events).toHaveLength(0);

    const active = makeContext({ ...base, observatory: { ownerId: "defender", status: "active" } }, clock);
    holdDevelopmentForAttack(active.ctx, { targetKey: TILE, attackerId: "attacker", commandId: "atk" });
    expect(active.events).toHaveLength(0);
  });

  it("tells the settle-cancel hook the hold's own command id, never the attacker's", () => {
    const { ctx, cancelled } = makeContext({ ...base }, { now: 1 });
    holdDevelopmentForAttack(ctx, { targetKey: TILE, attackerId: "attacker", commandId: "atk" });
    expect(cancelled).toEqual([{ attackerId: "attacker", commandId: "attack-hold:atk" }]);
  });

  it("releasing a tile with nothing paused changes and emits nothing", () => {
    const { ctx, events, timers } = makeContext({ ...base, economicStructure: { ownerId: "defender", type: "MINTWORKS", status: "under_construction", completesAt: 9_000 } }, { now: 1 });
    releaseDevelopmentHold(ctx, TILE, "atk");
    expect(events).toHaveLength(0);
    expect(timers).toHaveLength(0);
  });

  it("a completion timer armed for an old deadline, or fired while paused, does nothing", () => {
    const clock = { now: 0 };
    const { ctx, tiles, timers, completed } = makeContext({ ...base, economicStructure: { ownerId: "defender", type: "MINTWORKS", status: "under_construction", completesAt: 1_000 } }, clock);
    scheduleStructureCompletion(ctx, { tileKey: TILE, ownerId: "defender", field: "economicStructure", structureType: "MINTWORKS", commandId: "b", completesAt: 1_000 });

    // Deadline moved on (a pause/resume cycle): the original timer is stale.
    tiles.set(TILE, { ...base, economicStructure: { ownerId: "defender", type: "MINTWORKS", status: "under_construction", completesAt: 2_000 } });
    timers[0]!.run();
    expect(completed).toHaveLength(0);

    // Same deadline but paused: also nothing.
    tiles.set(TILE, { ...base, economicStructure: { ownerId: "defender", type: "MINTWORKS", status: "under_construction", completesAt: 1_000, pausedAt: 10 } });
    timers[0]!.run();
    expect(completed).toHaveLength(0);

    // Exactly the armed deadline and not paused: completes.
    tiles.set(TILE, { ...base, economicStructure: { ownerId: "defender", type: "MINTWORKS", status: "under_construction", completesAt: 1_000 } });
    timers[0]!.run();
    expect(completed).toHaveLength(1);
  });

  it("slides startedAt with the deadline so build progress resumes where it froze", () => {
    const clock = { now: 40_000 };
    // 100s build, started at 0: 40% done when the attack lands.
    const { ctx, tiles } = makeContext({ ...base, economicStructure: { ownerId: "defender", type: "MINTWORKS", status: "under_construction", startedAt: 0, completesAt: 100_000 } }, clock);
    holdDevelopmentForAttack(ctx, { targetKey: TILE, attackerId: "attacker", commandId: "atk" });
    clock.now = 70_000; // 30s paused
    releaseDevelopmentHold(ctx, TILE, "atk");
    const resumed = tiles.get(TILE)?.economicStructure;
    expect(resumed).toMatchObject({ startedAt: 30_000, completesAt: 130_000 });
    // Progress right after resuming is still 40%, not the 54% an unshifted startedAt would read.
    expect((clock.now - (resumed?.startedAt ?? 0)) / ((resumed?.completesAt ?? 1) - (resumed?.startedAt ?? 0))).toBeCloseTo(0.4, 6);
  });
});
