import { describe, expect, it } from "vitest";
import { devQueueWaypointCommandPayload, isDevQueueWaypointMessageType } from "./dev-queue-waypoint-message.js";

describe("isDevQueueWaypointMessageType", () => {
  it("recognizes all six dev/waypoint-queue message types", () => {
    for (const type of [
      "DEV_QUEUE_ENQUEUE",
      "DEV_QUEUE_CANCEL",
      "DEV_QUEUE_MOVE_TO_FRONT",
      "WAYPOINT_ENQUEUE",
      "WAYPOINT_CANCEL",
      "WAYPOINT_CANCEL_ALL"
    ]) {
      expect(isDevQueueWaypointMessageType(type)).toBe(true);
    }
  });

  it("rejects unrelated message types", () => {
    expect(isDevQueueWaypointMessageType("SETTLE")).toBe(false);
    expect(isDevQueueWaypointMessageType("BUILD_FORT")).toBe(false);
  });
});

describe("devQueueWaypointCommandPayload", () => {
  it("strips the type tag, keeping every other field", () => {
    expect(devQueueWaypointCommandPayload({ type: "DEV_QUEUE_ENQUEUE", x: 1, y: 2, tileKey: "1,2", kind: "SETTLE" })).toEqual({
      x: 1,
      y: 2,
      tileKey: "1,2",
      kind: "SETTLE"
    });
  });

  it("returns an empty object for a type-only message", () => {
    expect(devQueueWaypointCommandPayload({ type: "WAYPOINT_CANCEL_ALL" })).toEqual({});
  });
});
