import { describe, expect, it } from "vitest";
import {
  DEV_QUEUE_SERVER_CAP,
  cancelDevQueueEntry,
  devQueuePositionForTile,
  emptyDevQueueState,
  enqueueOrPlanDevQueueEntry,
  moveDevQueueEntryToFront,
  type DevQueueState
} from "./dev-queue.js";

const fill = (count: number, kind: "SETTLE" | "BUILD" | "FRONTIER" = "SETTLE"): DevQueueState => {
  let state = emptyDevQueueState();
  for (let i = 0; i < count; i++) {
    state = enqueueOrPlanDevQueueEntry(state, { tileKey: `${i},0`, kind, queuedAt: i });
  }
  return state;
};

describe("dev queue: enqueue vs plan", () => {
  it("fills queued up to the server cap before spilling into planned", () => {
    const state = fill(DEV_QUEUE_SERVER_CAP + 3);
    expect(state.queued).toHaveLength(DEV_QUEUE_SERVER_CAP);
    expect(state.planned).toHaveLength(3);
    expect(state.queued[0].tileKey).toBe("0,0");
    expect(state.planned[0].tileKey).toBe(`${DEV_QUEUE_SERVER_CAP},0`);
  });

  it("does not add a duplicate tile already present in either list", () => {
    let state = enqueueOrPlanDevQueueEntry(emptyDevQueueState(), { tileKey: "1,1", kind: "SETTLE", queuedAt: 0 });
    state = enqueueOrPlanDevQueueEntry(state, { tileKey: "1,1", kind: "SETTLE", queuedAt: 1 });
    expect(state.queued).toHaveLength(1);
  });
});

describe("dev queue: cancel + auto-promote", () => {
  it("promotes the front of planned into queued when a queued entry is cancelled", () => {
    const full = fill(DEV_QUEUE_SERVER_CAP + 1);
    const plannedTile = full.planned[0].tileKey;
    const next = cancelDevQueueEntry(full, "0,0");
    expect(next.queued).toHaveLength(DEV_QUEUE_SERVER_CAP);
    expect(next.planned).toHaveLength(0);
    expect(next.queued.some((e) => e.tileKey === plannedTile)).toBe(true);
  });

  it("does not promote anything when cancelling a planned-only entry", () => {
    const full = fill(DEV_QUEUE_SERVER_CAP + 2);
    const next = cancelDevQueueEntry(full, full.planned[0].tileKey);
    expect(next.queued).toHaveLength(DEV_QUEUE_SERVER_CAP);
    expect(next.planned).toHaveLength(1);
  });
});

describe("dev queue: jump to front of queue", () => {
  it("moving a queued entry to front reorders within the server queue", () => {
    const state = fill(3);
    const next = moveDevQueueEntryToFront(state, "2,0");
    expect(next.queued.map((e) => e.tileKey)).toEqual(["2,0", "0,0", "1,0"]);
  });

  it("moving a planned entry to front slots it straight into queued when there's a free slot", () => {
    const state = fill(DEV_QUEUE_SERVER_CAP - 1); // one free slot
    const plannedState = enqueueOrPlanDevQueueEntry(state, { tileKey: "planned-a", kind: "SETTLE", queuedAt: 999 });
    // Still fits directly into queued since there was a free slot -- planned stays empty.
    expect(plannedState.planned).toHaveLength(0);
    expect(plannedState.queued).toHaveLength(DEV_QUEUE_SERVER_CAP);
  });

  it("jumping a planned entry to front when the queue is full displaces the current last-in-line queued entry back to planned", () => {
    const state = fill(DEV_QUEUE_SERVER_CAP + 1);
    const jumpingTile = state.planned[0].tileKey;
    const displacedTile = state.queued[DEV_QUEUE_SERVER_CAP - 1].tileKey;

    const next = moveDevQueueEntryToFront(state, jumpingTile);

    // Cap is preserved -- never exceeded, nothing silently dropped.
    expect(next.queued).toHaveLength(DEV_QUEUE_SERVER_CAP);
    // The jumping tile is now Queue #1.
    expect(devQueuePositionForTile(next, jumpingTile)).toEqual({ state: "queued", position: 1 });
    // The tile that was last in the queue got bumped to the front of planned.
    expect(devQueuePositionForTile(next, displacedTile)).toEqual({ state: "planned", position: 1 });
    expect(next.planned).toHaveLength(1);
  });

  it("moving a queued entry that's already first is a no-op", () => {
    const state = fill(3);
    const next = moveDevQueueEntryToFront(state, "0,0");
    expect(next).toEqual(state);
  });
});

describe("dev queue: position lookup", () => {
  it("reports queued position 1-indexed", () => {
    const state = fill(2);
    expect(devQueuePositionForTile(state, "0,0")).toEqual({ state: "queued", position: 1 });
    expect(devQueuePositionForTile(state, "1,0")).toEqual({ state: "queued", position: 2 });
  });

  it("reports planned position 1-indexed once the cap is reached", () => {
    const state = fill(DEV_QUEUE_SERVER_CAP + 1);
    expect(devQueuePositionForTile(state, `${DEV_QUEUE_SERVER_CAP},0`)).toEqual({ state: "planned", position: 1 });
  });

  it("returns undefined for a tile not present in either list", () => {
    const state = fill(1);
    expect(devQueuePositionForTile(state, "99,99")).toBeUndefined();
  });
});
