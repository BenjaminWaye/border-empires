import { afterEach, describe, expect, it, vi } from "vitest";
import { musterFlagCap, type MusterState } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { drawMusterBadges2D, musterBadgeLookup, musterBadgePercent, ownMusterFlagKeys, OWN_FLAG_INDEX_REFRESH_MS } from "./client-muster-flag-badge.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const stateWithFlag = (muster: Partial<MusterState> & { amount: number }) => {
  const state = createInitialState();
  state.me = "player-1";
  state.manpower = 100_000;
  state.manpowerCap = 1_000;
  state.tiles.set("0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", muster: { ownerId: "player-1", mode: "HOLD", updatedAt: 0, ...muster } } as Tile);
  state.tiles.set("10,20", { x: 10, y: 20, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" } as Tile);
  return state;
};

const badgeAt = (state: ReturnType<typeof stateWithFlag>, key = "0,0") => musterBadgeLookup(state, keyFor)(key);

describe("musterBadgeLookup", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a HOLD flag shows how full it is against its own cap, as a capacity badge", () => {
    const cap = musterFlagCap(1_000, undefined); // 150: the floor wins at this manpower cap
    const badge = badgeAt(stateWithFlag({ amount: cap / 2 }));
    expect(badge).toMatchObject({ kind: "capacity", staged: cap / 2, required: cap });
    expect(musterBadgePercent(badge!.ratio)).toBe(50);
  });

  it("a full HOLD flag reads 100%", () => {
    const cap = musterFlagCap(1_000, 2);
    expect(musterBadgePercent(badgeAt(stateWithFlag({ amount: cap, capLevel: 2 }))!.ratio)).toBe(100);
  });

  it("a MARCH flag with a chosen commitment counts toward that commitment, as an attack badge", () => {
    const badge = badgeAt(stateWithFlag({ amount: 60, mode: "MARCH", targetX: 10, targetY: 20, commitManpower: 240 }));
    expect(badge).toMatchObject({ kind: "attack", staged: 60, required: 240 });
    expect(musterBadgePercent(badge!.ratio)).toBe(25);
  });

  it("a MARCH on a target its commitment wouldn't be spent on (Planetary Defense) reads as capacity", () => {
    const state = stateWithFlag({ amount: 60, mode: "MARCH", targetX: 10, targetY: 20, commitManpower: 240 });
    state.tiles.set("10,20", { x: 10, y: 20, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "FRONTIER" } as Tile);
    expect(badgeAt(state)?.kind).toBe("capacity");
  });

  it("an attack badge never predicts past the flag's own cap, where the server stops filling it", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const flagCap = musterFlagCap(1_000, undefined); // 150
    const state = stateWithFlag({ amount: 100, updatedAt: now, ratePerMin: 600 });
    state.attackCommitByTargetKey.set("10,20", { commitManpower: 900, setAt: now });
    state.pendingMusterAttacks = [{ targetX: 10, targetY: 20, fromX: 0, fromY: 0, musterTileKey: "0,0" }];
    badgeAt(state); // anchor the sample

    vi.mocked(Date.now).mockReturnValue(now + 10 * 60_000); // rate alone would add 6000
    const badge = badgeAt(state)!;
    expect(badge.required).toBe(900);
    expect(badge.staged).toBe(flagCap);
  });

  it("shows no badge before the manpower cap is known", () => {
    const state = stateWithFlag({ amount: 40 });
    state.manpowerCap = 0;
    expect(badgeAt(state)).toBeUndefined();
  });

  it("ignores a stored commitment while the flag is on HOLD", () => {
    expect(badgeAt(stateWithFlag({ amount: 60, commitManpower: 240 }))?.kind).toBe("capacity");
  });

  it("a parked manual attack on the flag wins, using the player's chosen commitment", () => {
    const state = stateWithFlag({ amount: 60, mode: "MARCH", targetX: 10, targetY: 20, commitManpower: 500 });
    state.attackCommitByTargetKey.set("10,20", { commitManpower: 120, setAt: Date.now() });
    state.pendingMusterAttacks = [{ targetX: 10, targetY: 20, fromX: 0, fromY: 0, musterTileKey: "0,0" }];
    expect(badgeAt(state)).toMatchObject({ kind: "attack", staged: 60, required: 120 });
  });

  it("gives rival flags no badge", () => {
    const state = stateWithFlag({ amount: 10 });
    state.tiles.set("5,5", { x: 5, y: 5, terrain: "LAND", ownerId: "rival", muster: { ownerId: "rival", amount: 50, mode: "HOLD", updatedAt: 0 } } as Tile);
    expect(badgeAt(state, "5,5")).toBeUndefined();
    expect(badgeAt(state, "10,20")).toBeUndefined();
  });

  // Carried over from the old "Mustering..." banner: the rate estimate from a
  // short first sample overshoots, and an attack badge must never claim 100%
  // before a real delta (which is what actually fires the attack) gets there.
  it("never extrapolates an attack badge up to or past its requirement before a real delta confirms it", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const state = stateWithFlag({ amount: 22, updatedAt: now });
    state.pendingMusterAttacks = [{ targetX: 10, targetY: 20, fromX: 0, fromY: 0, musterTileKey: "0,0" }];
    badgeAt(state); // first sample: 22 staged

    vi.mocked(Date.now).mockReturnValue(now + 20_000);
    const badge = badgeAt(state)!;
    expect(badge.required).toBe(60); // MUSTER_ATTACK_COST for a plain settled target
    expect(badge.staged).toBeLessThan(60);
    expect(musterBadgePercent(badge.ratio)).toBeLessThan(100);
  });
});

describe("ownMusterFlagKeys", () => {
  it("lists only our flags and re-scans at most once per refresh window", () => {
    const state = stateWithFlag({ amount: 10 });
    state.tiles.set("5,5", { x: 5, y: 5, terrain: "LAND", ownerId: "rival", muster: { ownerId: "rival", amount: 50, mode: "HOLD", updatedAt: 0 } } as Tile);
    expect(ownMusterFlagKeys(state, 1_000_000)).toEqual(["0,0"]);

    state.tiles.set("7,7", { x: 7, y: 7, terrain: "LAND", ownerId: "player-1", muster: { ownerId: "player-1", amount: 0, mode: "HOLD", updatedAt: 0 } } as Tile);
    expect(ownMusterFlagKeys(state, 1_000_000 + OWN_FLAG_INDEX_REFRESH_MS - 1)).toEqual(["0,0"]);
    expect(ownMusterFlagKeys(state, 1_000_000 + OWN_FLAG_INDEX_REFRESH_MS)).toEqual(["0,0", "7,7"]);
  });
});

describe("drawMusterBadges2D", () => {
  it("paints one badge above each of our flags on the 2D canvas", () => {
    const state = stateWithFlag({ amount: 75 });
    const arcs: Array<[number, number]> = [];
    const texts: string[] = [];
    const ctx = {
      canvas: { width: 800, height: 600 },
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
      fill: vi.fn(), stroke: vi.fn(),
      arc: (x: number, y: number) => arcs.push([x, y]),
      fillText: (text: string) => texts.push(text)
    } as unknown as CanvasRenderingContext2D;
    // Tile (0,0) centred at (400, 300) on screen.
    drawMusterBadges2D(state, keyFor, () => ({ sx: 400, sy: 300 }), ctx, 40, 10, 7, 5_000_000);
    expect(texts).toEqual(["50%"]);
    expect(arcs.length).toBeGreaterThan(0);
    // Above the tile, not on it.
    for (const [x, y] of arcs) {
      expect(x).toBe(400);
      expect(y).toBeLessThan(300);
    }
  });
});

describe("musterBadgePercent", () => {
  it("floors and clamps to 0-100", () => {
    expect(musterBadgePercent(0.999)).toBe(99);
    expect(musterBadgePercent(-1)).toBe(0);
    expect(musterBadgePercent(3)).toBe(100);
  });
});
