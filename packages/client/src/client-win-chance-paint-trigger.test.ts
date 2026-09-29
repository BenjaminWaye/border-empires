import { describe, expect, it } from "vitest";
import { tilesAlongLine, triggerWinChancePaintOnMarchArm } from "./client-win-chance-paint-trigger.js";
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
