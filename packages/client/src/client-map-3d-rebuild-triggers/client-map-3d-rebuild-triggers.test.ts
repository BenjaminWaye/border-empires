import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { frontierAttackClaimRebuildSnapshot } from "./client-map-3d-rebuild-triggers.js";
import type { ClientState } from "../client-state/client-state.js";

const keyFor = (x: number, y: number) => `${x},${y}`;
const EPOCH_NOW = Date.UTC(2026, 9, 13, 12, 0, 0);

const createState = (overrides: Partial<ClientState>): ClientState =>
  ({
    me: "me",
    outgoingMusterAttacksByTile: new Map(),
    incomingAttacksByTile: new Map(),
    capture: undefined,
    tiles: new Map([["5,5", { x: 5, y: 5, terrain: "LAND", ownerId: "enemy", ownershipState: "FRONTIER" }]]),
    ...overrides
  }) as unknown as ClientState;

describe("frontierAttackClaimRebuildSnapshot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH_NOW);
    // A page-relative clock, like the render loop's nowMs. If the snapshot
    // ever compared epoch claim timestamps against this, every claim would
    // look perpetually unresolved.
    vi.spyOn(performance, "now").mockReturnValue(5_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("drops a manual ATTACK claim from the snapshot once its epoch resolvesAt has passed", () => {
    const state = createState({
      capture: { startAt: EPOCH_NOW - 1_000, resolvesAt: EPOCH_NOW + 2_000, target: { x: 5, y: 5 }, actionType: "ATTACK" }
    });
    expect(frontierAttackClaimRebuildSnapshot(state, keyFor)).toBe("5,5");

    vi.setSystemTime(EPOCH_NOW + 2_001);
    // state.capture still lingers until the server's result lands; the claim
    // end must change the snapshot on its own so maybeRebuild fires.
    expect(frontierAttackClaimRebuildSnapshot(state, keyFor)).toBe("");
  });

  it("adds a muster ATTACK claim once its epoch transitEndsAt passes, and drops it at resolvesAt", () => {
    const state = createState({
      outgoingMusterAttacksByTile: new Map([
        ["5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, transitEndsAt: EPOCH_NOW + 1_000, resolvesAt: EPOCH_NOW + 3_000 }]
      ])
    });
    expect(frontierAttackClaimRebuildSnapshot(state, keyFor)).toBe("");

    vi.setSystemTime(EPOCH_NOW + 1_001);
    expect(frontierAttackClaimRebuildSnapshot(state, keyFor)).toBe("5,5");

    vi.setSystemTime(EPOCH_NOW + 3_001);
    expect(frontierAttackClaimRebuildSnapshot(state, keyFor)).toBe("");
  });

  it("sorts keys so the snapshot string is stable across Map insertion order", () => {
    const tiles = new Map([
      ["5,5", { x: 5, y: 5, terrain: "LAND", ownerId: "enemy", ownershipState: "FRONTIER" }],
      ["1,1", { x: 1, y: 1, terrain: "LAND", ownerId: "enemy", ownershipState: "FRONTIER" }]
    ]);
    const state = createState({
      tiles: tiles as never,
      outgoingMusterAttacksByTile: new Map([
        ["5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: EPOCH_NOW + 3_000 }],
        ["1,1", { originX: 0, originY: 1, targetX: 1, targetY: 1, resolvesAt: EPOCH_NOW + 3_000 }]
      ])
    });
    expect(frontierAttackClaimRebuildSnapshot(state, keyFor)).toBe("1,1,5,5");
  });
});
