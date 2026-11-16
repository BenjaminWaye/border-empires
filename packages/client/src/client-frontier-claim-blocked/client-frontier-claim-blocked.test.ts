import { describe, expect, it } from "vitest";
import { buildFrontierQueue } from "../client-queue-logic/client-queue-logic.js";
import type { ClientState } from "../client-state/client-state.js";
import { frontierClaimBlockedMessage } from "./client-frontier-claim-blocked.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const parseKey = (key: string): { x: number; y: number } => {
  const [x, y] = key.split(",").map(Number);
  return { x: x ?? 0, y: y ?? 0 };
};

describe("frontier claim next to a still-pending claim", () => {
  // Owned 0,0. 1,0 is neutral but already queued for EXPAND. 2,0 only touches 1,0.
  const state = {
    me: "me",
    tiles: new Map([
      ["0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "me" }],
      ["1,0", { x: 1, y: 0, terrain: "LAND" }],
      ["2,0", { x: 2, y: 0, terrain: "LAND" }]
    ])
  } as unknown as ClientState;
  const deps = { keyFor, parseKey, wrapX: (x: number) => x, wrapY: (y: number) => y, enqueue: () => true };

  it("is queued when an origin (the pending claim) is reachable", () => {
    const out = buildFrontierQueue(state, ["2,0"], { ...deps, hasOrigin: (x, y) => x === 2 && y === 0 });
    expect(out.queued).toBe(1);
  });
});

describe("frontierClaimBlockedMessage", () => {
  const base = { frontierSyncWaitUntilByTarget: new Map<string, number>(), queuedTargetKeys: new Set<string>() };

  it("never blames coin (frontier claims are free)", () => {
    expect(frontierClaimBlockedMessage(base, ["5,5"])).not.toMatch(/coin/i);
  });

  it("explains a retry cooldown instead of reachability", () => {
    const state = { ...base, frontierSyncWaitUntilByTarget: new Map([["5,5", 2_000]]) };
    expect(frontierClaimBlockedMessage(state, ["5,5"], 1_000)).toMatch(/regrouping/);
  });

  it("says settlers are already on the way when the tile is queued", () => {
    const state = { ...base, queuedTargetKeys: new Set(["5,5"]) };
    expect(frontierClaimBlockedMessage(state, ["5,5"])).toMatch(/already on their way/);
  });
});
