import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { attackNeedsNewMusterFlag, musterFlagSpotChoices } from "./client-muster-flag-spot.js";
import { clientMusterTransitRoute } from "../client-muster-transit-route/client-muster-transit-route.js";
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
  state.tiles.get(`${x},${y}`)!.muster = { ownerId, amount: 0, mode: "HOLD", updatedAt: Date.now() } as NonNullable<Tile["muster"]>;
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
    const spots = musterFlagSpotChoices(world(), ORIGIN, Date.now(), TARGET);
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
    expect(musterFlagSpotChoices(state, ORIGIN, Date.now(), TARGET)[0]).toMatchObject({ x: 14, y: 9, kind: "safe" });
  });

  // Review finding (PR #3002): the tie-break ignored where the target is and
  // fell back to the lowest x, so with the enemy to the west it picked a
  // tile beside the firing tile instead of the one behind it.
  it("prefers the tile directly behind the firing tile when the target is to the west", () => {
    const state = createInitialState();
    state.me = "me";
    state.musterFlagLimit = 2;
    // One enemy tile at (9, 10). The player owns x 10..20 except a pocket
    // at x 11..12, y 8..12, so the nearest safe tiles are 3 away from the
    // firing tile (10, 10): (13, 10) behind it, and (10, 7) / (10, 13)
    // beside it, all equally near.
    state.tiles.set("9,10", { x: 9, y: 10, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" } as Tile);
    for (let y = 5; y <= 15; y += 1) {
      for (let x = 10; x <= 20; x += 1) {
        const pocket = x >= 11 && x <= 12 && y >= 8 && y <= 12;
        state.tiles.set(`${x},${y}`, { x, y, terrain: "LAND", ...(pocket ? {} : { ownerId: "me" }), ownershipState: "SETTLED" } as Tile);
      }
    }
    const spots = musterFlagSpotChoices(state, { x: 10, y: 10 }, Date.now(), { x: 9, y: 10 });
    expect(spots[0]).toMatchObject({ x: 13, y: 10, kind: "safe" });
  });

  // Review finding (PR #3002): spots were ranked by straight-line distance
  // only, so a safe tile whose march is blocked by water won the default
  // over one the company reaches on foot.
  it("prefers a safe tile with a quicker march over a nearer one cut off by water", () => {
    const state = world();
    // Water right in front of (14, 10), the nearest safe tile straight
    // behind the firing tile: its company has to walk round, while (14, 8)
    // and (14, 12) step past the water's ends.
    for (const [x, y] of [[15, 9], [15, 10], [15, 11]] as const) {
      state.tiles.get(`${x},${y}`)!.terrain = "SEA";
    }
    const spots = musterFlagSpotChoices(state, ORIGIN, Date.now(), TARGET);
    const blocked = clientMusterTransitRoute(state, { x: 14, y: 10 }, ORIGIN).transitMs;
    expect(spots[0]!.kind).toBe("safe");
    expect(spots[0]).not.toMatchObject({ x: 14, y: 10 });
    expect(spots[0]!.transitMs).toBeLessThan(blocked);
  });
});
