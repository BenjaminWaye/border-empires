import { describe, expect, it } from "vitest";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { WaypointWireStep } from "@border-empires/shared";
import { tryDrainWaypointQueue, type RuntimeWaypointDrainContext } from "./runtime-waypoint-drain.js";
import type { ServerWaypointQueueEntry } from "../player-runtime-summary.js";

const PLAYER_ID = "player-1";

function tile(x: number, y: number, overrides: Partial<DomainTileState> = {}): DomainTileState {
  return { x, y, terrain: "LAND", ...overrides };
}

type MakeContextOptions = {
  tiles?: Map<string, DomainTileState>;
  dispatchResultFor?: (x: number, y: number, actionType: FrontierCommandType) => boolean;
  rejectionCode?: string;
  isPlayerOnline?: boolean;
};

function makeContext(waypointQueue: ServerWaypointQueueEntry[], options: MakeContextOptions = {}) {
  const summary = { waypointQueue };
  const tiles = options.tiles ?? new Map<string, DomainTileState>();
  const dispatched: { command: CommandEnvelope; actionType: FrontierCommandType }[] = [];

  const context: RuntimeWaypointDrainContext = {
    summaryForPlayer: () => summary,
    now: () => 1000,
    tileAt: (x, y) => tiles.get(`${x},${y}`),
    isHostileOwner: (playerId, targetOwnerId) => Boolean(targetOwnerId) && targetOwnerId !== playerId,
    nextDrainCommandId: (playerId, x, y) => `drain:${playerId}:${x},${y}`,
    isPlayerOnline: () => options.isPlayerOnline ?? false,
    dispatchFrontierCommand: (command, actionType) => {
      dispatched.push({ command, actionType });
      if (!options.dispatchResultFor) return { accepted: true };
      const payload = JSON.parse(command.payloadJson) as { toX: number; toY: number };
      const accepted = options.dispatchResultFor(payload.toX, payload.toY, actionType);
      return accepted ? { accepted: true } : { accepted: false, code: options.rejectionCode ?? "BARRIER" };
    }
  };
  return { context, summary, dispatched, tiles };
}

const step = (ox: number, oy: number, tx: number, ty: number, action: "EXPAND" | "ATTACK" = "EXPAND"): WaypointWireStep => ({
  origin: { x: ox, y: oy },
  target: { x: tx, y: ty },
  action
});

describe("tryDrainWaypointQueue -- plan-carrying entries (steps[]/cursor)", () => {
  it("walks a 3-step plan one leg per call, using each step's real origin, and drops the entry once complete", () => {
    // Test 2 (plan doc): a 3-step plan enqueued, player offline: ticks
    // dispatch leg 1, 2, 3 in order with the real origins, one per tick, and
    // the entry is dropped after the last.
    const tiles = new Map([
      ["1,1", tile(1, 1)],
      ["2,1", tile(2, 1)],
      ["3,1", tile(3, 1)],
      ["4,1", tile(4, 1)]
    ]);
    const steps = [step(1, 1, 2, 1), step(2, 1, 3, 1), step(3, 1, 4, 1)];
    const entry: ServerWaypointQueueEntry = { target: { x: 4, y: 1 }, queuedAt: 0, steps, cursor: 0 };
    const { context, summary, dispatched } = makeContext([entry], { tiles });

    tryDrainWaypointQueue(context, PLAYER_ID);
    expect(dispatched).toHaveLength(1);
    expect(JSON.parse(dispatched[0]!.command.payloadJson)).toMatchObject({ fromX: 1, fromY: 1, toX: 2, toY: 1 });
    expect(summary.waypointQueue[0]!.cursor).toBe(1);

    tryDrainWaypointQueue(context, PLAYER_ID);
    expect(dispatched).toHaveLength(2);
    expect(JSON.parse(dispatched[1]!.command.payloadJson)).toMatchObject({ fromX: 2, fromY: 1, toX: 3, toY: 1 });
    expect(summary.waypointQueue[0]!.cursor).toBe(2);

    tryDrainWaypointQueue(context, PLAYER_ID);
    expect(dispatched).toHaveLength(3);
    expect(JSON.parse(dispatched[2]!.command.payloadJson)).toMatchObject({ fromX: 3, fromY: 1, toX: 4, toY: 1 });
    expect(summary.waypointQueue).toHaveLength(0); // dropped -- complete
  });

  it("does not drain at all while the player is online", () => {
    // Test 3.
    const steps = [step(1, 1, 2, 1)];
    const entry: ServerWaypointQueueEntry = { target: { x: 2, y: 1 }, queuedAt: 0, steps, cursor: 0 };
    const { context, summary, dispatched } = makeContext([entry], { isPlayerOnline: true });

    tryDrainWaypointQueue(context, PLAYER_ID);

    expect(dispatched).toHaveLength(0);
    expect(summary.waypointQueue).toHaveLength(1);
    expect(summary.waypointQueue[0]!.cursor).toBe(0);
  });

  it("marks a stale mid-route step stalled, leaves cursor and entry in place, and stops dispatching it", () => {
    // Test 6.
    const tiles = new Map([
      ["2,1", tile(2, 1)],
      ["3,1", tile(3, 1)]
    ]);
    const steps = [step(1, 1, 2, 1), step(2, 1, 3, 1)];
    const entry: ServerWaypointQueueEntry = { target: { x: 3, y: 1 }, queuedAt: 0, steps, cursor: 0 };
    // Origin (1,1) is not a real tile -- the dispatch is rejected as
    // genuinely invalid (not one of RETRYABLE_WAYPOINT_DRAIN_CODES).
    const { context, summary, dispatched } = makeContext([entry], { tiles, dispatchResultFor: () => false, rejectionCode: "ORIGIN_NOT_OWNED" });

    tryDrainWaypointQueue(context, PLAYER_ID);

    expect(dispatched).toHaveLength(1);
    expect(summary.waypointQueue).toHaveLength(1);
    expect(summary.waypointQueue[0]!.cursor).toBe(0);
    expect(summary.waypointQueue[0]!.stalled).toBe(true);

    // Stalled entries stay stalled and the server stops touching them --
    // another drain call makes no further dispatch attempt at all. Only
    // enqueue-time replacement (a newer plannedAt) clears `stalled`.
    tryDrainWaypointQueue(context, PLAYER_ID);
    expect(dispatched).toHaveLength(1);
    expect(summary.waypointQueue[0]!.cursor).toBe(0);
    expect(summary.waypointQueue[0]!.stalled).toBe(true);
  });

  it("defers a retryable rejection (INSUFFICIENT_MANPOWER) without advancing the cursor, and the next tick retries", () => {
    // Test 7.
    const tiles = new Map([
      ["1,1", tile(1, 1)],
      ["2,1", tile(2, 1)]
    ]);
    const steps = [step(1, 1, 2, 1)];
    const entry: ServerWaypointQueueEntry = { target: { x: 2, y: 1 }, queuedAt: 0, steps, cursor: 0 };
    let allow = false;
    const { context, summary, dispatched } = makeContext([entry], {
      tiles,
      dispatchResultFor: () => allow,
      rejectionCode: "INSUFFICIENT_MANPOWER"
    });

    tryDrainWaypointQueue(context, PLAYER_ID);
    expect(dispatched).toHaveLength(1);
    expect(summary.waypointQueue[0]!.cursor).toBe(0);
    expect(summary.waypointQueue[0]!.stalled ?? false).toBe(false);

    allow = true;
    tryDrainWaypointQueue(context, PLAYER_ID);
    expect(dispatched).toHaveLength(2);
    expect(summary.waypointQueue).toHaveLength(0); // single-step plan, now complete
  });

  it("leaves a trackBarbarian plan entirely untouched by the offline drain", () => {
    // Test 8.
    const tiles = new Map([
      ["1,1", tile(1, 1)],
      ["2,1", tile(2, 1)]
    ]);
    const steps = [step(1, 1, 2, 1)];
    const entry: ServerWaypointQueueEntry = { target: { x: 2, y: 1 }, queuedAt: 0, steps, cursor: 0, trackBarbarian: true };
    const { context, summary, dispatched } = makeContext([entry], { tiles });

    tryDrainWaypointQueue(context, PLAYER_ID);

    expect(dispatched).toHaveLength(0);
    expect(summary.waypointQueue).toEqual([entry]);
  });

  it("advances the cursor without dispatching when a mid-route step's target is already owned", () => {
    const tiles = new Map([
      ["2,1", tile(2, 1, { ownerId: PLAYER_ID })], // already claimed some other way
      ["3,1", tile(3, 1)]
    ]);
    const steps = [step(1, 1, 2, 1), step(2, 1, 3, 1)];
    const entry: ServerWaypointQueueEntry = { target: { x: 3, y: 1 }, queuedAt: 0, steps, cursor: 0 };
    const { context, summary, dispatched } = makeContext([entry], { tiles });

    tryDrainWaypointQueue(context, PLAYER_ID);

    // Free advance past step 0, then a real dispatch for step 1.
    expect(dispatched).toHaveLength(1);
    expect(JSON.parse(dispatched[0]!.command.payloadJson)).toMatchObject({ fromX: 2, fromY: 1, toX: 3, toY: 1 });
  });
});

describe("tryDrainWaypointQueue -- legacy target-only entries", () => {
  it("still behaves as a single-leg direct dispatch with no steps[]", () => {
    // Test 10.
    const tiles = new Map([["5,5", tile(5, 5)]]);
    const entry: ServerWaypointQueueEntry = { target: { x: 5, y: 5 }, queuedAt: 0 };
    const { context, summary, dispatched } = makeContext([entry], { tiles });

    tryDrainWaypointQueue(context, PLAYER_ID);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.actionType).toBe("EXPAND");
    expect(summary.waypointQueue).toHaveLength(0);
  });
});
