import { describe, expect, it } from "vitest";
import { DEV_QUEUE_SERVER_CAP } from "@border-empires/shared";
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
