import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { attackNeedsNewMusterFlag, musterFlagSpotChoices } from "./client-muster-flag-spot.js";
import type { Tile } from "../client-types.js";

// Own land x 10..16, enemy land x 17..20, rows y 5..15. The firing tile is
// (16, 10), the target (17, 10).
const world = () => {
  const state = createInitialState();
  state.me = "me";
  state.musterFlagLimit = 2;
  for (let y = 5; y <= 15; y += 1) {
    for (let x = 10; x <= 20; x += 1) {
      state.tiles.set(`${x},${y}`, { x, y, terrain: "LAND", ownerId: x <= 16 ? "me" : "enemy", ownershipState: "SETTLED" } as Tile);
    }
  }
  return state;
};
const ORIGIN = { x: 16, y: 10 };
const TARGET = { x: 17, y: 10 };
const flagAt = (state: ReturnType<typeof world>, x: number, y: number, ownerId = "me"): void => {
  state.tiles.get(`${x},${y}`)!.muster = { ownerId, amount: 0, mode: "HOLD", updatedAt: Date.now() } as Tile["muster"];
};

describe("attackNeedsNewMusterFlag", () => {
  it("is true when the player has no flag near the firing tile", () => {
    expect(attackNeedsNewMusterFlag(world(), ORIGIN, TARGET)).toBe(true);
  });

  it("is false when a flag of the player's is within funding range, so no flag is created and no step is shown", () => {
    const state = world();
    flagAt(state, 11, 10);
    expect(attackNeedsNewMusterFlag(state, ORIGIN, TARGET)).toBe(false);
  });

  it("ignores another player's flag", () => {
    const state = world();
    flagAt(state, 18, 10, "enemy");
    expect(attackNeedsNewMusterFlag(state, ORIGIN, TARGET)).toBe(true);
  });

  it("is false while a flag the player just asked for is still being placed nearby", () => {
    const state = world();
    state.pendingMusterAttacks.push({ targetX: 17, targetY: 11, fromX: 16, fromY: 11, musterTileKey: "13,10", queuedAt: Date.now(), musterRequestedAt: Date.now() });
    expect(attackNeedsNewMusterFlag(state, ORIGIN, TARGET)).toBe(false);
  });

  it("is false at the flag cap, leaving the existing 'flags full' feedback to explain", () => {
    const state = world();
    state.musterFlagLimit = 0;
    expect(attackNeedsNewMusterFlag(state, ORIGIN, TARGET)).toBe(false);
  });
});

describe("musterFlagSpotChoices", () => {
  it("defaults to the nearest tile 3+ tiles from the enemy, straight behind the firing tile, then a closer tile, then the border", () => {
    const spots = musterFlagSpotChoices(world(), ORIGIN);
    expect(spots.map(({ x, y, kind, enemyDistance }) => ({ x, y, kind, enemyDistance }))).toEqual([
      { x: 14, y: 10, kind: "safe", enemyDistance: undefined },
      { x: 15, y: 10, kind: "closer", enemyDistance: 2 },
      { x: 16, y: 10, kind: "border", enemyDistance: 1 }
    ]);
    expect(spots[0]!.transitMs).toBeGreaterThan(spots[1]!.transitMs);
    expect(spots[2]!.transitMs).toBe(0);
  });

  it("counts allies as friendly ground", () => {
    const state = world();
    state.allies = ["enemy"];
    // No hostile tile anywhere: the nearest tile is already safe, and the border spot is too.
    const spots = musterFlagSpotChoices(state, ORIGIN);
    expect(spots.map((s) => s.kind)).toEqual(["border"]);
  });

  it("offers the safest tile in range when none reaches the safe distance", () => {
    const state = world();
    for (let y = 5; y <= 15; y += 1) for (let x = 10; x <= 14; x += 1) state.tiles.delete(`${x},${y}`);
    const spots = musterFlagSpotChoices(state, ORIGIN);
    expect(spots[0]).toMatchObject({ x: 15, y: 10, kind: "safe", enemyDistance: 2 });
    expect(spots.map((s) => s.kind)).toEqual(["safe", "border"]);
  });

  it("skips tiles that already hold a flag", () => {
    const state = world();
    flagAt(state, 14, 10);
    expect(musterFlagSpotChoices(state, ORIGIN)[0]).toMatchObject({ x: 14, y: 9, kind: "safe" });
  });
});
