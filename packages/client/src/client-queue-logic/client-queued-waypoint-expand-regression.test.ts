import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import {
  actionQueueIndexForTile,
  cancelQueuedExpandEntry,
  cancelQueuedWaypointEntry,
  moveActionQueueEntryToFront,
  moveWaypointToFront,
  waypointIndexForTile
} from "./client-queue-logic.js";
import { queuedExpandProgressForTile, queuedWaypointProgressForTile } from "../client-tile-menu-queue-progress/client-tile-menu-queue-progress.js";
import { injectWaypointActions } from "../client-waypoint-menu-actions/client-waypoint-menu-actions.js";
import type { TileMenuView } from "../client-types.js";
import type { WaypointPlan } from "@border-empires/shared";

const fakePlan = (target: { x: number; y: number }): WaypointPlan => ({
  target,
  steps: [],
  totalGold: 0,
  totalManpower: 0,
  totalDurationMs: 0,
  expandCount: 1,
  attackCount: 0,
  reachable: true
});

const keyFor = (x: number, y: number): string => `${x},${y}`;
const noopFeed = (): void => {};
const noopRender = (): void => {};

describe("queued waypoint progress + reducers", () => {
  it("shows no jump-to-front for the active (first) waypoint, but shows it for later ones", () => {
    const state = createInitialState();
    state.me = "me";
    state.waypoint = [
      { target: { x: 5, y: 5 }, plan: fakePlan({ x: 5, y: 5 }) },
      { target: { x: 9, y: 9 }, plan: fakePlan({ x: 9, y: 9 }) }
    ];

    const activeProgress = queuedWaypointProgressForTile(
      { x: 5, y: 5 } as never,
      { waypointIndexForTile: (x, y) => waypointIndexForTile(state, x, y), waypointCount: () => state.waypoint.length }
    );
    expect(activeProgress?.cancelActionId).toBe("cancel_queued_waypoint");
    expect(activeProgress?.secondaryActionId).toBeUndefined();

    const queuedProgress = queuedWaypointProgressForTile(
      { x: 9, y: 9 } as never,
      { waypointIndexForTile: (x, y) => waypointIndexForTile(state, x, y), waypointCount: () => state.waypoint.length }
    );
    expect(queuedProgress?.cancelActionId).toBe("cancel_queued_waypoint");
    expect(queuedProgress?.secondaryActionId).toBe("move_waypoint_to_front");
    expect(queuedProgress?.remainingLabel).toBe("Queue #2 of 2");
  });

  it("cancels only the targeted waypoint entry", () => {
    const state = createInitialState();
    state.me = "me";
    state.waypoint = [
      { target: { x: 5, y: 5 }, plan: fakePlan({ x: 5, y: 5 }) },
      { target: { x: 9, y: 9 }, plan: fakePlan({ x: 9, y: 9 }) }
    ];

    expect(cancelQueuedWaypointEntry(state, 9, 9, { pushFeed: noopFeed, renderHud: noopRender })).toBe(true);
    expect(state.waypoint).toHaveLength(1);
    expect(state.waypoint[0]?.target).toEqual({ x: 5, y: 5 });
  });

  it("moves a later waypoint to the front of the queue", () => {
    const state = createInitialState();
    state.me = "me";
    state.waypoint = [
      { target: { x: 5, y: 5 }, plan: fakePlan({ x: 5, y: 5 }) },
      { target: { x: 9, y: 9 }, plan: fakePlan({ x: 9, y: 9 }) }
    ];

    expect(moveWaypointToFront(state, 9, 9, { pushFeed: noopFeed, renderHud: noopRender })).toBe(true);
    expect(state.waypoint.map((w) => w.target)).toEqual([{ x: 9, y: 9 }, { x: 5, y: 5 }]);
    // Front entry can't be moved further to the front.
    expect(moveWaypointToFront(state, 9, 9, { pushFeed: noopFeed, renderHud: noopRender })).toBe(false);
  });

  it("does not offer 'Add Waypoint' on a tile that's already a later queued waypoint target", () => {
    const state = createInitialState();
    state.me = "me";
    state.waypoint = [
      { target: { x: 5, y: 5 }, plan: fakePlan({ x: 5, y: 5 }) },
      { target: { x: 9, y: 9 }, plan: fakePlan({ x: 9, y: 9 }) }
    ];
    const view: TileMenuView = { title: "", subtitle: "", tabs: [], overviewLines: [], actions: [], buildings: [], crystal: [] };
    const tile = { x: 9, y: 9, terrain: "LAND", fogged: false } as never;

    injectWaypointActions(view, tile, state, { keyFor, pickOriginForTarget: () => undefined });

    expect(view.actions).toHaveLength(0);
  });
});

describe("queued expand (frontier action queue) progress + reducers", () => {
  it("labels the front entry differently and only offers jump-to-front for later ones", () => {
    const state = createInitialState();
    state.me = "me";
    state.actionQueue = [
      { x: 3, y: 3 },
      { x: 7, y: 7 }
    ];

    const frontProgress = queuedExpandProgressForTile(
      { x: 3, y: 3, ownerId: undefined } as never,
      { actionQueueIndexForTile: (x, y) => actionQueueIndexForTile(state, x, y), actionQueueLength: () => state.actionQueue.length }
    );
    expect(frontProgress?.cancelActionId).toBe("cancel_queued_expand");
    expect(frontProgress?.secondaryActionId).toBeUndefined();

    const queuedProgress = queuedExpandProgressForTile(
      { x: 7, y: 7, ownerId: "enemy" } as never,
      { actionQueueIndexForTile: (x, y) => actionQueueIndexForTile(state, x, y), actionQueueLength: () => state.actionQueue.length }
    );
    expect(queuedProgress?.title).toContain("attack");
    expect(queuedProgress?.secondaryActionId).toBe("move_action_queue_entry_to_front");
  });

  it("cancels only the targeted action-queue entry and clears its queued-target key", () => {
    const state = createInitialState();
    state.me = "me";
    state.actionQueue = [
      { x: 3, y: 3 },
      { x: 7, y: 7 }
    ];
    state.queuedTargetKeys = new Set(["3,3", "7,7"]);

    expect(cancelQueuedExpandEntry(state, 7, 7, { keyFor, pushFeed: noopFeed, renderHud: noopRender })).toBe(true);
    expect(state.actionQueue).toEqual([{ x: 3, y: 3 }]);
    expect(state.queuedTargetKeys.has("7,7")).toBe(false);
  });

  it("moves a later action-queue entry to the front", () => {
    const state = createInitialState();
    state.me = "me";
    state.actionQueue = [
      { x: 3, y: 3 },
      { x: 7, y: 7 }
    ];

    expect(moveActionQueueEntryToFront(state, 7, 7, { pushFeed: noopFeed, renderHud: noopRender })).toBe(true);
    expect(state.actionQueue).toEqual([{ x: 7, y: 7 }, { x: 3, y: 3 }]);
  });
});
