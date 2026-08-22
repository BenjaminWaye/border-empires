import { describe, expect, it, vi } from "vitest";
import { cancelWaypointsBlockedByOutOfReach, type WaypointOutOfReachDeps } from "./client-waypoint-out-of-reach.js";
import type { ClientState, ClientWaypoint } from "../client-state/client-state.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const waypointAt = (x: number, y: number, overrides: Partial<ClientWaypoint> = {}): ClientWaypoint => ({
  target: { x, y },
  plan: { reachable: true, steps: [], blockReason: undefined } as unknown as ClientWaypoint["plan"],
  ...overrides
});

type TestState = Pick<ClientState, "me" | "waypoint" | "queuedTargetKeys" | "actionQueue">;

const stateWith = (waypoint: ClientWaypoint[], overrides: Partial<TestState> = {}): ClientState => ({
  me: "me",
  waypoint,
  queuedTargetKeys: new Set<string>(),
  actionQueue: [],
  ...overrides
}) as unknown as ClientState;

const depsWith = (): { deps: WaypointOutOfReachDeps; sendGameMessage: ReturnType<typeof vi.fn>; pushFeed: ReturnType<typeof vi.fn>; persist: ReturnType<typeof vi.fn> } => {
  const sendGameMessage = vi.fn(() => true);
  const pushFeed = vi.fn();
  const persist = vi.fn();
  return {
    sendGameMessage,
    pushFeed,
    persist,
    deps: {
      keyFor,
      pushFeed,
      sendGameMessage,
      persistWaypointQueue: persist,
      waypointCancelWirePayload: (target) => ({ type: "WAYPOINT_CANCEL", ...target })
    }
  };
};

describe("OUT_OF_REACH waypoint recovery", () => {
  it("cancels the active waypoint whose last enqueued step the server refused", () => {
    // The wedge case from the field report: the waypoint's next hop was
    // rejected OUT_OF_REACH, and retrying it could never succeed.
    const blocked = waypointAt(445, 240, { lastEnqueuedKey: "445,237" });
    const state = stateWith([blocked]);
    const { deps, sendGameMessage, persist } = depsWith();

    expect(cancelWaypointsBlockedByOutOfReach(state, "445,237", deps)).toEqual([{ x: 445, y: 240 }]);
    expect(state.waypoint).toEqual([]);
    // The durable server mirror must be cancelled too, or a reconnect
    // restores the entry and the retry loop starts over from zero.
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "WAYPOINT_CANCEL", x: 445, y: 240 });
    expect(persist).toHaveBeenCalledWith("me", []);
  });

  it("cancels a waypoint whose own destination is the refused tile", () => {
    const state = stateWith([waypointAt(445, 237)]);
    const { deps, sendGameMessage } = depsWith();

    expect(cancelWaypointsBlockedByOutOfReach(state, "445,237", deps)).toEqual([{ x: 445, y: 237 }]);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "WAYPOINT_CANCEL", x: 445, y: 237 });
  });

  it("leaves unrelated waypoints queued", () => {
    const blocked = waypointAt(445, 240, { lastEnqueuedKey: "445,237" });
    const other = waypointAt(100, 100, { lastEnqueuedKey: "100,101" });
    const state = stateWith([blocked, other]);
    const { deps } = depsWith();

    cancelWaypointsBlockedByOutOfReach(state, "445,237", deps);
    expect(state.waypoint).toEqual([other]);
  });

  it("clears the queued-target bookkeeping for the refused tile", () => {
    // Otherwise enqueueTarget early-returns forever on a leftover key and the
    // tile can never be claimed again, even once it is genuinely in reach.
    const state = stateWith([waypointAt(445, 240, { lastEnqueuedKey: "445,237" })], {
      queuedTargetKeys: new Set(["445,237"]),
      actionQueue: [{ x: 445, y: 237, retries: 0 }, { x: 1, y: 1, retries: 0 }]
    });
    const { deps } = depsWith();

    cancelWaypointsBlockedByOutOfReach(state, "445,237", deps);
    expect(state.queuedTargetKeys.has("445,237")).toBe(false);
    expect(state.actionQueue).toEqual([{ x: 1, y: 1, retries: 0 }]);
  });

  it("explains why, so the player knows to build closer", () => {
    const state = stateWith([waypointAt(445, 240, { lastEnqueuedKey: "445,237" })]);
    const { deps, pushFeed } = depsWith();

    cancelWaypointsBlockedByOutOfReach(state, "445,237", deps);
    expect(pushFeed).toHaveBeenCalledTimes(1);
    expect(String(pushFeed.mock.calls[0]?.[0])).toContain("outside your borders");
  });

  it("does nothing when no waypoint depends on the refused tile", () => {
    const state = stateWith([waypointAt(100, 100, { lastEnqueuedKey: "100,101" })]);
    const { deps, sendGameMessage, pushFeed } = depsWith();

    expect(cancelWaypointsBlockedByOutOfReach(state, "445,237", deps)).toEqual([]);
    expect(state.waypoint).toHaveLength(1);
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(pushFeed).not.toHaveBeenCalled();
  });

  it("ignores an empty tile key", () => {
    const state = stateWith([waypointAt(445, 240, { lastEnqueuedKey: "445,237" })]);
    const { deps } = depsWith();
    expect(cancelWaypointsBlockedByOutOfReach(state, "", deps)).toEqual([]);
    expect(state.waypoint).toHaveLength(1);
  });
});
