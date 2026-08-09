import { describe, expect, it } from "vitest";
import { DEV_QUEUE_SERVER_CAP } from "@border-empires/shared";
import {
  devQueueCancel,
  devQueueEnqueue,
  devQueueMoveToFront,
  parseDevQueueEnqueuePayload,
  parseDevQueueTileKeyPayload
} from "./runtime-dev-queue.js";
import type { ServerDevQueueEntry } from "./player-runtime-summary.js";

describe("devQueueEnqueue", () => {
  it("appends a new entry", () => {
    const { queue, accepted } = devQueueEnqueue([], { x: 1, y: 2, tileKey: "1,2", kind: "SETTLE" }, 1000);
    expect(accepted).toBe(true);
    expect(queue).toEqual([{ tileKey: "1,2", x: 1, y: 2, kind: "SETTLE", queuedAt: 1000 }]);
  });

  it("keeps structureType for BUILD entries", () => {
    const { queue } = devQueueEnqueue([], { x: 1, y: 2, tileKey: "1,2", kind: "BUILD", structureType: "FORT" }, 1000);
    expect(queue[0]).toMatchObject({ structureType: "FORT" });
  });

  it("de-dupes by tileKey", () => {
    const seed: ServerDevQueueEntry[] = [{ tileKey: "1,2", x: 1, y: 2, kind: "SETTLE", queuedAt: 1 }];
    const { queue, accepted } = devQueueEnqueue(seed, { x: 1, y: 2, tileKey: "1,2", kind: "SETTLE" }, 2000);
    expect(accepted).toBe(false);
    expect(queue).toBe(seed);
  });

  it("rejects once the server cap is reached", () => {
    const full: ServerDevQueueEntry[] = Array.from({ length: DEV_QUEUE_SERVER_CAP }, (_, i) => ({
      tileKey: `${i},0`,
      x: i,
      y: 0,
      kind: "SETTLE",
      queuedAt: i
    }));
    const { accepted } = devQueueEnqueue(full, { x: 99, y: 0, tileKey: "99,0", kind: "SETTLE" }, 9999);
    expect(accepted).toBe(false);
  });
});

describe("devQueueCancel / devQueueMoveToFront", () => {
  const seed: ServerDevQueueEntry[] = [
    { tileKey: "1,1", x: 1, y: 1, kind: "SETTLE", queuedAt: 1 },
    { tileKey: "2,2", x: 2, y: 2, kind: "SETTLE", queuedAt: 2 },
    { tileKey: "3,3", x: 3, y: 3, kind: "SETTLE", queuedAt: 3 }
  ];

  it("removes the matching entry", () => {
    expect(devQueueCancel(seed, "2,2").map((e) => e.tileKey)).toEqual(["1,1", "3,3"]);
  });

  it("is a no-op when the tile isn't queued", () => {
    expect(devQueueCancel(seed, "9,9")).toEqual(seed);
  });

  it("moves an entry to the front", () => {
    expect(devQueueMoveToFront(seed, "3,3").map((e) => e.tileKey)).toEqual(["3,3", "1,1", "2,2"]);
  });

  it("is a no-op when already at the front", () => {
    expect(devQueueMoveToFront(seed, "1,1")).toBe(seed);
  });
});

describe("payload parsers", () => {
  it("parses a valid enqueue payload", () => {
    expect(parseDevQueueEnqueuePayload(JSON.stringify({ x: 1, y: 2, tileKey: "1,2", kind: "SETTLE" }))).toEqual({
      x: 1,
      y: 2,
      tileKey: "1,2",
      kind: "SETTLE"
    });
  });

  it("rejects a BUILD payload missing structureType", () => {
    expect(parseDevQueueEnqueuePayload(JSON.stringify({ x: 1, y: 2, tileKey: "1,2", kind: "BUILD" }))).toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(parseDevQueueEnqueuePayload("not json")).toBeNull();
  });

  it("parses a tileKey-only payload", () => {
    expect(parseDevQueueTileKeyPayload(JSON.stringify({ tileKey: "1,2" }))).toEqual({ tileKey: "1,2" });
  });
});
