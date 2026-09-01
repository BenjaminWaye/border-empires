import { describe, expect, it } from "vitest";
import type { ClientState } from "../client-state/client-state.js";
import { enqueueAdjacentExpandWaypoint } from "./client-adjacent-expand-claim.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const baseState = (overrides: Partial<ClientState> = {}): ClientState =>
  ({
    me: "player-1",
    waypoint: [],
    dockPairs: [],
    allies: [],
    activeTruces: [],
    tiles: new Map([
      [keyFor(5, 5), { x: 5, y: 5, ownerId: "player-1", terrain: "LAND" }],
      [keyFor(6, 5), { x: 6, y: 5, ownerId: undefined, terrain: "LAND" }]
    ]),
    ...overrides
  }) as unknown as ClientState;

describe("enqueueAdjacentExpandWaypoint", () => {
  it("pushes a durable single-step waypoint entry and mirrors it to the server via WAYPOINT_ENQUEUE, instead of only queueing in memory", () => {
    const state = baseState();
    const sent: unknown[] = [];
    const sendGameMessage = (payload: unknown): boolean => {
      sent.push(payload);
      return true;
    };

    const queued = enqueueAdjacentExpandWaypoint(state, 6, 5, keyFor, sendGameMessage, () => false);

    expect(queued).toBe(true);
    expect(state.waypoint).toHaveLength(1);
    expect(state.waypoint[0]?.target).toEqual({ x: 6, y: 5 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "WAYPOINT_ENQUEUE", x: 6, y: 5 });
  });

  it("calls processActionQueue after enqueueing, and un-silences the capture only if THIS target became the active one", () => {
    const state = baseState();
    const sendGameMessage = (): boolean => true;
    let drained = false;
    // Simulates processActionQueue's synchronous dispatch making this
    // target the active capture, silenced by default (the same as
    // client-queue-logic.ts's dispatch does for any neutral EXPAND).
    const processActionQueue = (): boolean => {
      drained = true;
      state.capture = { startAt: 0, resolvesAt: 1000, target: { x: 6, y: 5 }, actionType: "EXPAND", silent: true } as never;
      return true;
    };

    enqueueAdjacentExpandWaypoint(state, 6, 5, keyFor, sendGameMessage, processActionQueue);

    expect(drained).toBe(true);
    expect(state.capture).toMatchObject({ target: { x: 6, y: 5 }, silent: false });
  });

  it("leaves an unrelated in-flight capture untouched when processActionQueue is a no-op", () => {
    const state = baseState();
    const sendGameMessage = (): boolean => true;
    // Simulates processActionQueue bailing out early (something else
    // already in flight) -- must not misattribute that other capture to
    // this click's target.
    state.capture = { startAt: 0, resolvesAt: 1000, target: { x: 99, y: 99 }, actionType: "EXPAND" } as never;
    const processActionQueue = (): boolean => false;

    enqueueAdjacentExpandWaypoint(state, 6, 5, keyFor, sendGameMessage, processActionQueue);

    expect(state.capture).toMatchObject({ target: { x: 99, y: 99 } });
  });

  it("does not enqueue, send, or drain for an unreachable target", () => {
    // No owned tile anywhere in state, so there is no possible origin to
    // path an expand from -- planWaypoint must report unreachable.
    const state = baseState({ tiles: new Map([[keyFor(6, 5), { x: 6, y: 5, ownerId: undefined, terrain: "LAND" }]]) } as never);
    const sent: unknown[] = [];
    const sendGameMessage = (payload: unknown): boolean => {
      sent.push(payload);
      return true;
    };
    let drained = false;
    const processActionQueue = (): boolean => {
      drained = true;
      return false;
    };

    const queued = enqueueAdjacentExpandWaypoint(state, 6, 5, keyFor, sendGameMessage, processActionQueue);

    expect(queued).toBe(false);
    expect(state.waypoint).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(drained).toBe(false);
  });
});
