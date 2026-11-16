import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { createClientOriginSelection } from "../client-origin-selection/client-origin-selection.js";
import type { Tile } from "../client-types.js";
import { buildFrontierQueue } from "./client-queue-build-frontier.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const parseKey = (key: string): { x: number; y: number } => {
  const [x, y] = key.split(",").map(Number);
  return { x: x ?? 0, y: y ?? 0 };
};
const wrap = (value: number): number => ((value % 450) + 450) % 450;

// Owned 10,10. 11,10 is neutral and already queued for EXPAND (the tile
// action menu treats that pending claim as an origin). 12,10 only touches
// 11,10. Regression: tapping "settle" on 12,10 was refused because the
// queue only counted tiles already owned as adjacent.
const setup = () => {
  const state = createInitialState();
  state.me = "me";
  const add = (tile: Tile): void => void state.tiles.set(keyFor(tile.x, tile.y), tile);
  add({ x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" });
  add({ x: 11, y: 10, terrain: "LAND" });
  add({ x: 12, y: 10, terrain: "LAND" });
  state.actionQueue.push({ x: 11, y: 10, retries: 0 });
  state.queuedTargetKeys.add("11,10");
  const selector = createClientOriginSelection({ state, keyFor, wrapX: wrap, wrapY: wrap });
  const enqueued: string[] = [];
  const deps = { keyFor, parseKey, wrapX: wrap, wrapY: wrap, enqueue: (x: number, y: number) => (enqueued.push(keyFor(x, y)), true) };
  return { state, selector, deps, enqueued };
};

describe("buildFrontierQueue next to a still-pending claim", () => {
  it("queues the target when the menu's own origin check (pickOriginForTarget, no dock-adjacency) finds the pending claim", () => {
    const { state, selector, deps, enqueued } = setup();
    expect(selector.pickOriginForTarget(12, 10, false)).toMatchObject({ x: 11, y: 10 });
    const out = buildFrontierQueue(state, ["12,10"], { ...deps, hasOrigin: (x, y) => Boolean(selector.pickOriginForTarget(x, y, false)) });
    expect(out.queued).toBe(1);
    expect(enqueued).toEqual(["12,10"]);
  });

  it("still refuses a target with no origin at all", () => {
    const { state, selector, deps } = setup();
    const out = buildFrontierQueue(state, ["14,10"], { ...deps, hasOrigin: (x, y) => Boolean(selector.pickOriginForTarget(x, y, false)) });
    expect(out).toMatchObject({ queued: 0, skipped: 1 });
  });

  it("asks hasOrigin only for targets adjacency can't reach, and at most once each", () => {
    const { state, deps } = setup();
    const hasOrigin = vi.fn((_x: number, _y: number) => false);
    // 11,9 touches owned 10,10; 20,20 and 21,21 are unreachable.
    state.tiles.set("11,9", { x: 11, y: 9, terrain: "LAND" });
    const out = buildFrontierQueue(state, ["11,9", "20,20", "21,21"], { ...deps, hasOrigin });
    expect(out.queued).toBe(1);
    expect(hasOrigin).toHaveBeenCalledTimes(2);
    expect(hasOrigin.mock.calls.map(([x, y]) => keyFor(x, y)).sort()).toEqual(["20,20", "21,21"]);
  });
});
