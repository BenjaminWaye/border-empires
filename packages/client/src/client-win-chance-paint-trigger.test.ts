import { describe, expect, it } from "vitest";
import { describeMarchWinChance, tilesAlongLine, triggerWinChancePaintOnMarchArm } from "./client-win-chance-paint-trigger.js";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile } from "./client-types.js";

type TestState = Pick<ClientState, "tiles" | "winChancePaint" | "me">;

const keyFor = (x: number, y: number): string => `${x},${y}`;

describe("tilesAlongLine", () => {
  it("returns a single point when origin equals target", () => {
    expect(tilesAlongLine(3, 3, 3, 3)).toEqual([{ x: 3, y: 3 }]);
  });

  it("includes both endpoints on a horizontal line", () => {
    expect(tilesAlongLine(0, 0, 3, 0)).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }
    ]);
  });

  it("includes both endpoints on a diagonal line", () => {
    expect(tilesAlongLine(0, 0, 3, 3)).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }
    ]);
  });

  it("includes both endpoints regardless of direction", () => {
    const forward = tilesAlongLine(0, 0, 4, 2);
    expect(forward[0]).toEqual({ x: 0, y: 0 });
    expect(forward[forward.length - 1]).toEqual({ x: 4, y: 2 });
    const backward = tilesAlongLine(4, 2, 0, 0);
    expect(backward[0]).toEqual({ x: 4, y: 2 });
    expect(backward[backward.length - 1]).toEqual({ x: 0, y: 0 });
  });
});

describe("triggerWinChancePaintOnMarchArm", () => {
  const enemyTile: Tile = { ownerId: "enemy-1", terrain: "LAND" } as Tile;
  const ownTile: Tile = { ownerId: "me", terrain: "LAND" } as Tile;
  const neutralTile: Tile = { terrain: "LAND" } as Tile;

  const stateWith = (tiles: Map<string, Tile>): TestState => ({
    tiles,
    winChancePaint: undefined,
    me: "me"
  });

  it("no-ops when the target is unexplored", () => {
    const state = stateWith(new Map());
    triggerWinChancePaintOnMarchArm(state, 0, 0, 3, 0, "unexplored", keyFor, 1000);
    expect(state.winChancePaint).toBeUndefined();
  });

  it("labels a freshly captured FRONTIER tile still holding ground as a real fight, not a sure win", () => {
    const held = { ownerId: "enemy-1", terrain: "LAND", ownershipState: "FRONTIER", captureHoldUntil: Date.now() + 60_000 } as Tile;
    const plain = { ownerId: "enemy-1", terrain: "LAND", ownershipState: "FRONTIER" } as Tile;
    const state = stateWith(new Map([[keyFor(1, 0), held], [keyFor(2, 0), plain]]));
    triggerWinChancePaintOnMarchArm(state, 0, 0, 2, 0, "visible", keyFor, 1000);
    const byX = new Map(state.winChancePaint?.entries.map((e) => [e.x, e.winChance]));
    expect(byX.get(1)).toBeLessThan(1);
    expect(byX.get(2)).toBe(1);
  });

  it("no-ops when origin equals target", () => {
    const state = stateWith(new Map());
    triggerWinChancePaintOnMarchArm(state, 2, 2, 2, 2, "visible", keyFor, 1000);
    expect(state.winChancePaint).toBeUndefined();
  });

  it("labels only enemy-owned tiles crossed by the line, never the origin or the player's own/neutral tiles", () => {
    const tiles = new Map<string, Tile>([
      [keyFor(0, 0), ownTile], // origin -- never labeled even though it's along the line
      [keyFor(1, 0), enemyTile],
      [keyFor(2, 0), neutralTile], // no owner -- skipped
      [keyFor(3, 0), enemyTile]
    ]);
    const state = stateWith(tiles);
    triggerWinChancePaintOnMarchArm(state, 0, 0, 3, 0, "visible", keyFor, 1000);
    expect(state.winChancePaint?.entries.map((e) => ({ x: e.x, y: e.y }))).toEqual([
      { x: 1, y: 0 },
      { x: 3, y: 0 }
    ]);
  });

  it("sets an expiry in the future", () => {
    const tiles = new Map<string, Tile>([[keyFor(1, 0), enemyTile]]);
    const state = stateWith(tiles);
    triggerWinChancePaintOnMarchArm(state, 0, 0, 1, 0, "visible", keyFor, 1000);
    expect(state.winChancePaint?.expiresAt).toBeGreaterThan(1000);
  });
});

// Regression: the March To confirm sheet's slider showed no win chance at all
// -- the odds only appeared as labels painted along the arrow on the map.
describe("describeMarchWinChance", () => {
  const stateWith = (tiles: Array<[string, Tile]>): Pick<ClientState, "tiles" | "me"> => ({ tiles: new Map(tiles), me: "me" });
  const settledEnemy = (x: number, y: number): Tile => ({ x, y, ownerId: "enemy-1", terrain: "LAND", ownershipState: "SETTLED" }) as Tile;
  const percentIn = (text: string): number => Number(/Win chance (\d+)%/.exec(text)?.[1]);

  it("reports the target's win chance and the manpower committed", () => {
    const state = stateWith([["2,0", settledEnemy(2, 0)]]);
    const text = describeMarchWinChance(state, { x: 2, y: 0 }, keyFor, { committedManpower: 60, baseMusterCost: 60 });
    expect(text).toMatch(/^Win chance \d+% at \(2, 0\)/);
    expect(text).toContain("commits 60 manpower");
  });

  it("rises as the slider commits more manpower", () => {
    const state = stateWith([["2,0", settledEnemy(2, 0)]]);
    const at = (committedManpower: number) =>
      percentIn(describeMarchWinChance(state, { x: 2, y: 0 }, keyFor, { committedManpower, baseMusterCost: 60 }));
    expect(at(120)).toBeGreaterThan(at(60));
  });

  it("says extra manpower does nothing against plain frontier ground", () => {
    const state = stateWith([["2,0", { x: 2, y: 0, ownerId: "enemy-1", terrain: "LAND", ownershipState: "FRONTIER" } as Tile]]);
    expect(describeMarchWinChance(state, { x: 2, y: 0 }, keyFor, { committedManpower: 120, baseMusterCost: 60 })).toContain("extra manpower doesn't change the odds here");
  });

  it("points at the arrow's labels when the target itself isn't enemy-held", () => {
    const state = stateWith([["2,0", { terrain: "LAND" } as Tile]]);
    expect(describeMarchWinChance(state, { x: 2, y: 0 }, keyFor, { committedManpower: 60, baseMusterCost: 60 })).toContain("isn't enemy-held");
  });
});
