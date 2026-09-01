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

    const queued = enqueueAdjacentExpandWaypoint(state, 6, 5, keyFor, sendGameMessage);

    expect(queued).toBe(true);
    expect(state.waypoint).toHaveLength(1);
    expect(state.waypoint[0]?.target).toEqual({ x: 6, y: 5 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "WAYPOINT_ENQUEUE", x: 6, y: 5 });
    // The overlay must show immediately for a manual tap, so no `silent`
    // flag is set on the optimistic capture.
    expect(state.capture).toMatchObject({ target: { x: 6, y: 5 }, actionType: "EXPAND" });
    expect(state.capture).not.toHaveProperty("silent");
  });

  it("does not enqueue, send, or set a capture for an unreachable target", () => {
    // No owned tile anywhere in state, so there is no possible origin to
    // path an expand from -- planWaypoint must report unreachable.
    const state = baseState({ tiles: new Map([[keyFor(6, 5), { x: 6, y: 5, ownerId: undefined, terrain: "LAND" }]]) } as never);
    const sent: unknown[] = [];
    const sendGameMessage = (payload: unknown): boolean => {
      sent.push(payload);
      return true;
    };

    const queued = enqueueAdjacentExpandWaypoint(state, 6, 5, keyFor, sendGameMessage);

    expect(queued).toBe(false);
    expect(state.waypoint).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(state.capture).toBeUndefined();
  });
});
