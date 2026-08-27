import { describe, expect, it } from "vitest";
import { DEV_QUEUE_SERVER_CAP, WAYPOINT_MAX_WIRE_STEPS } from "@border-empires/shared";
import {
  parseWaypointEnqueuePayload,
  parseWaypointTargetPayload,
  waypointQueueCancel,
  waypointQueueEnqueue
} from "./runtime-waypoint-queue.js";
import type { ServerWaypointQueueEntry } from "./player-runtime-summary.js";

describe("waypointQueueEnqueue", () => {
  it("appends a new entry", () => {
    const { queue, accepted } = waypointQueueEnqueue([], { x: 5, y: 6 }, 1000);
    expect(accepted).toBe(true);
    expect(queue).toEqual([{ target: { x: 5, y: 6 }, queuedAt: 1000 }]);
  });

  it("keeps trackBarbarian when set", () => {
    const { queue } = waypointQueueEnqueue([], { x: 5, y: 6, trackBarbarian: true }, 1000);
    expect(queue[0]).toMatchObject({ trackBarbarian: true });
  });

  it("de-dupes by target", () => {
    const seed: ServerWaypointQueueEntry[] = [{ target: { x: 5, y: 6 }, queuedAt: 1 }];
    const { queue, accepted } = waypointQueueEnqueue(seed, { x: 5, y: 6 }, 2000);
    expect(accepted).toBe(false);
    expect(queue).toBe(seed);
  });

  it("rejects once the server cap is reached", () => {
    const full: ServerWaypointQueueEntry[] = Array.from({ length: DEV_QUEUE_SERVER_CAP }, (_, i) => ({
      target: { x: i, y: 0 },
      queuedAt: i
    }));
    const { accepted } = waypointQueueEnqueue(full, { x: 999, y: 0 }, 9999);
    expect(accepted).toBe(false);
  });

  it("replaces an existing entry's steps in place (same queue position, same queuedAt) when the new enqueue carries a newer plannedAt", () => {
    // Test 6 (re-plan/replace half): a fresh enqueue with a newer plannedAt
    // replaces a stale/stalled entry in place instead of being rejected as a
    // duplicate-target no-op.
    const seed: ServerWaypointQueueEntry[] = [
      { target: { x: 1, y: 1 }, queuedAt: 100 },
      { target: { x: 5, y: 6 }, queuedAt: 500, planId: "old", plannedAt: 10, steps: [{ origin: { x: 5, y: 5 }, target: { x: 5, y: 6 }, action: "EXPAND" }], cursor: 1, stalled: true }
    ];
    const newSteps = [
      { origin: { x: 4, y: 4 }, target: { x: 4, y: 5 }, action: "EXPAND" as const },
      { origin: { x: 4, y: 5 }, target: { x: 5, y: 6 }, action: "EXPAND" as const }
    ];
    const { queue, accepted } = waypointQueueEnqueue(
      seed,
      { x: 5, y: 6, planId: "new", plannedAt: 20, steps: newSteps },
      9999
    );

    expect(accepted).toBe(true);
    expect(queue).toHaveLength(2);
    expect(queue[0]).toEqual(seed[0]); // untouched, same position
    expect(queue[1]).toEqual({
      target: { x: 5, y: 6 },
      queuedAt: 500, // preserved queue position's original queuedAt
      planId: "new",
      plannedAt: 20,
      steps: newSteps,
      cursor: 0, // reset -- fresh plan, walk from the start
      stalled: false
    });
  });

  it("rejects an enqueue for an existing target whose plannedAt is not newer", () => {
    const seed: ServerWaypointQueueEntry[] = [{ target: { x: 5, y: 6 }, queuedAt: 500, plannedAt: 20 }];
    const { queue, accepted } = waypointQueueEnqueue(seed, { x: 5, y: 6, plannedAt: 20 }, 9999);
    expect(accepted).toBe(false);
    expect(queue).toBe(seed);
  });
});

describe("parseWaypointEnqueuePayload -- steps[]", () => {
  it("parses a payload carrying planId/plannedAt/steps", () => {
    const payload = {
      x: 5,
      y: 6,
      planId: "plan-1",
      plannedAt: 42,
      steps: [{ origin: { x: 4, y: 6 }, target: { x: 5, y: 6 }, action: "EXPAND" }]
    };
    expect(parseWaypointEnqueuePayload(JSON.stringify(payload))).toEqual(payload);
  });

  it("rejects a steps[] longer than WAYPOINT_MAX_WIRE_STEPS", () => {
    // Test 9.
    const steps = Array.from({ length: WAYPOINT_MAX_WIRE_STEPS + 1 }, (_, i) => ({
      origin: { x: i, y: 0 },
      target: { x: i + 1, y: 0 },
      action: "EXPAND"
    }));
    expect(parseWaypointEnqueuePayload(JSON.stringify({ x: 999, y: 0, steps }))).toBeNull();
  });

  it("accepts a steps[] exactly at the cap", () => {
    const steps = Array.from({ length: WAYPOINT_MAX_WIRE_STEPS }, (_, i) => ({
      origin: { x: i, y: 0 },
      target: { x: i + 1, y: 0 },
      action: "EXPAND"
    }));
    expect(parseWaypointEnqueuePayload(JSON.stringify({ x: 999, y: 0, steps }))).not.toBeNull();
  });

  it("rejects a malformed steps[] entry rather than silently downgrading to target-only", () => {
    expect(parseWaypointEnqueuePayload(JSON.stringify({ x: 1, y: 2, steps: [{ origin: { x: 1 } }] }))).toBeNull();
  });
});

describe("waypointQueueCancel", () => {
  it("removes the matching target", () => {
    const seed: ServerWaypointQueueEntry[] = [
      { target: { x: 1, y: 1 }, queuedAt: 1 },
      { target: { x: 2, y: 2 }, queuedAt: 2 }
    ];
    expect(waypointQueueCancel(seed, { x: 1, y: 1 })).toEqual([{ target: { x: 2, y: 2 }, queuedAt: 2 }]);
  });
});

describe("payload parsers", () => {
  it("parses a valid enqueue payload", () => {
    expect(parseWaypointEnqueuePayload(JSON.stringify({ x: 1, y: 2 }))).toEqual({ x: 1, y: 2 });
  });

  it("rejects malformed JSON", () => {
    expect(parseWaypointEnqueuePayload("nope")).toBeNull();
  });

  it("parses a target-only payload", () => {
    expect(parseWaypointTargetPayload(JSON.stringify({ x: 3, y: 4 }))).toEqual({ x: 3, y: 4 });
  });
});
