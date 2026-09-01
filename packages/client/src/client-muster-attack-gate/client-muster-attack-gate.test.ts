import { describe, expect, it } from "vitest";
import { MUSTER_ATTACK_COST } from "@border-empires/shared";

import { createInitialState } from "../client-state/client-state.js";
import { findClosestMuster, isDockCrossingBetween } from "./client-muster-attack-gate.js";
import type { Tile } from "../client-types.js";

const makeTile = (overrides: Partial<Tile>): Tile => ({
  x: 0,
  y: 0,
  terrain: "LAND",
  fogged: false,
  ...overrides
});

describe("isDockCrossingBetween", () => {
  it("is true when the origin's dock pair lands directly on the target", () => {
    const state = createInitialState();
    state.dockPairs = [{ ax: 5, ay: 5, bx: 200, by: 200 }];
    expect(isDockCrossingBetween(state, 5, 5, 200, 200)).toBe(true);
  });

  it("is true via the reverse pair ordering (target stored as the ax/ay endpoint)", () => {
    const state = createInitialState();
    state.dockPairs = [{ ax: 200, ay: 200, bx: 5, by: 5 }];
    expect(isDockCrossingBetween(state, 5, 5, 200, 200)).toBe(true);
  });

  it("is true when the target is adjacent to the linked dock, not the dock itself", () => {
    const state = createInitialState();
    state.dockPairs = [{ ax: 5, ay: 5, bx: 200, by: 200 }];
    expect(isDockCrossingBetween(state, 5, 5, 201, 200)).toBe(true);
  });

  it("is false when there is no dock pair linking origin and target", () => {
    const state = createInitialState();
    state.dockPairs = [{ ax: 5, ay: 5, bx: 200, by: 200 }];
    expect(isDockCrossingBetween(state, 5, 5, 60, 60)).toBe(false);
  });
});

describe("findClosestMuster", () => {
  it("scores a ready flag on a dock-linked tile as a short hop regardless of raw distance", () => {
    const state = createInitialState();
    state.me = "me";
    // Enemy dock target is geographically far from the player's dock (raw
    // Chebyshev distance is huge), but the two docks are sea-linked.
    state.dockPairs = [{ ax: 5, ay: 5, bx: 300, by: 300 }];
    const musterTile = makeTile({
      x: 5,
      y: 5,
      dockId: "dockP",
      ownerId: "me",
      muster: { ownerId: "me", amount: MUSTER_ATTACK_COST, mode: "HOLD", updatedAt: 0 }
    });
    state.tiles.set("5,5", musterTile);

    const closest = findClosestMuster(state, 300, 300);
    expect(closest).toBeDefined();
    expect(closest!.tile.x).toBe(5);
    expect(closest!.tile.y).toBe(5);
    // A raw Chebyshev distance of 295 would fail any sane in-range gate;
    // the dock crossing must collapse it to a short fixed hop instead.
    expect(closest!.dist).toBeLessThan(10);
  });

  it("still uses raw distance for a flag with no dock link to the target", () => {
    const state = createInitialState();
    state.me = "me";
    state.dockPairs = [];
    const musterTile = makeTile({
      x: 5,
      y: 5,
      ownerId: "me",
      muster: { ownerId: "me", amount: MUSTER_ATTACK_COST, mode: "HOLD", updatedAt: 0 }
    });
    state.tiles.set("5,5", musterTile);

    const closest = findClosestMuster(state, 300, 300);
    expect(closest).toBeDefined();
    expect(closest!.dist).toBeGreaterThan(10);
  });

  it("ignores flags below the muster attack cost", () => {
    const state = createInitialState();
    state.me = "me";
    // A garrison-less enemy target requires the flat MUSTER_ATTACK_COST.
    state.tiles.set("6,6", makeTile({ x: 6, y: 6, ownerId: "enemy" }));
    const musterTile = makeTile({
      x: 5,
      y: 5,
      ownerId: "me",
      muster: { ownerId: "me", amount: MUSTER_ATTACK_COST - 1, mode: "HOLD", updatedAt: 0 }
    });
    state.tiles.set("5,5", musterTile);

    expect(findClosestMuster(state, 6, 6)).toBeUndefined();
  });

  it("requires more than the flat cost against an active fort, flat per fort tier regardless of garrison fill", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set(
      "6,6",
      makeTile({
        x: 6,
        y: 6,
        ownerId: "enemy",
        fort: { ownerId: "enemy", status: "active", variant: "FORT" }
      })
    );
    const musterTile = makeTile({
      x: 5,
      y: 5,
      ownerId: "me",
      muster: { ownerId: "me", amount: MUSTER_ATTACK_COST, mode: "HOLD", updatedAt: 0 }
    });
    state.tiles.set("5,5", musterTile);

    // 60 staged is not enough against a Fort (300 flat, structure-costs.ts's
    // ATTACK_MANPOWER_LOSS_RANGE.FORT.max) — the old flat MUSTER_ATTACK_COST
    // gate would have wrongly called this ready. Garrison fill no longer
    // matters here (that's a combat-power effect, not a muster gate).
    expect(findClosestMuster(state, 6, 6)).toBeUndefined();

    musterTile.muster!.amount = 300;
    expect(findClosestMuster(state, 6, 6)).toBeDefined();
  });

  it("uses the cheaper barbarian raid cost against a barbarian target", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set("6,6", makeTile({ x: 6, y: 6, ownerId: "barbarian-1" }));
    const musterTile = makeTile({
      x: 5,
      y: 5,
      ownerId: "me",
      muster: { ownerId: "me", amount: MUSTER_ATTACK_COST - 1, mode: "HOLD", updatedAt: 0 }
    });
    state.tiles.set("5,5", musterTile);

    // Below MUSTER_ATTACK_COST but above BARBARIAN_RAID_COST — still ready.
    expect(findClosestMuster(state, 6, 6)).toBeDefined();
  });
});
