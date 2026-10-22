import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { musterBadgePercent, pendingMusterBadgeRatios, pendingMusterBadges } from "./client-muster-pending-badge.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const stateWithParkedAttack = (amount: number, updatedAt = 0) => {
  const state = createInitialState();
  state.me = "player-1";
  state.manpower = 100_000;
  state.tiles.set("0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", muster: { ownerId: "player-1", amount, mode: "HOLD", updatedAt } } as Tile);
  state.tiles.set("10,20", { x: 10, y: 20, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" } as Tile);
  state.pendingMusterAttacks = [{ targetX: 10, targetY: 20, fromX: 0, fromY: 0, musterTileKey: "0,0" }];
  return state;
};

describe("pendingMusterBadges", () => {
  afterEach(() => vi.restoreAllMocks());

  it("puts one badge over the flag a parked attack is waiting on, with staged / required", () => {
    // Required is MUSTER_ATTACK_COST (60) for a plain settled target: 15/60 = 25%.
    const [badge, ...rest] = pendingMusterBadges(stateWithParkedAttack(15), keyFor);
    expect(rest).toEqual([]);
    expect(badge).toMatchObject({ tileKey: "0,0", x: 0, y: 0, staged: 15, required: 60 });
    expect(musterBadgePercent(badge!.ratio)).toBe(25);
  });

  it("uses the player's chosen commitment, not just the target's floor", () => {
    const state = stateWithParkedAttack(60);
    state.attackCommitByTargetKey.set("10,20", { commitManpower: 240, setAt: Date.now() });
    const [badge] = pendingMusterBadges(state, keyFor);
    expect(badge).toMatchObject({ staged: 60, required: 240 });
    expect(musterBadgePercent(badge!.ratio)).toBe(25);
  });

  it("shows nothing until the requested flag actually exists on the map", () => {
    const state = stateWithParkedAttack(0);
    state.tiles.delete("0,0");
    expect(pendingMusterBadges(state, keyFor)).toEqual([]);
    expect(pendingMusterBadgeRatios(state, keyFor).size).toBe(0);
  });

  it("keeps one badge per flag when several attacks wait on it, showing the latest", () => {
    const state = stateWithParkedAttack(30);
    state.tiles.set("11,20", { x: 11, y: 20, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" } as Tile);
    state.attackCommitByTargetKey.set("11,20", { commitManpower: 120, setAt: Date.now() });
    state.pendingMusterAttacks.push({ targetX: 11, targetY: 20, fromX: 0, fromY: 0, musterTileKey: "0,0" });
    expect(pendingMusterBadges(state, keyFor).map((b) => b.required)).toEqual([120]);
    expect(pendingMusterBadgeRatios(state, keyFor)).toEqual(new Map([["0,0", 0.25]]));
  });

  // Carried over from the old "Mustering..." banner: the rate estimate from a
  // short first sample overshoots, and the badge must never claim 100% before
  // a real delta (which is what actually fires the attack) gets there.
  it("never extrapolates up to or past required before a real delta confirms it", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const state = stateWithParkedAttack(22, now);
    pendingMusterBadges(state, keyFor); // first sample: 22 staged

    vi.mocked(Date.now).mockReturnValue(now + 20_000);
    const [badge] = pendingMusterBadges(state, keyFor);
    expect(badge!.required).toBe(60);
    expect(badge!.staged).toBeLessThan(60);
    expect(musterBadgePercent(badge!.ratio)).toBeLessThan(100);
  });
});

describe("musterBadgePercent", () => {
  it("floors and clamps to 0-100", () => {
    expect(musterBadgePercent(0.999)).toBe(99);
    expect(musterBadgePercent(-1)).toBe(0);
    expect(musterBadgePercent(3)).toBe(100);
  });
});
