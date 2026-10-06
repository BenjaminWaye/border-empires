import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { findHomeAfcTile, locateHomeAfc } from "./client-afc-locate.js";

const afcTile = (x: number, y: number, ownerId: string, activatedAt: number): Tile =>
  ({ x, y, terrain: "LAND", ownerId, ownershipState: "SETTLED", afc: { ownerId, status: "active", activatedAt } }) as Tile;

const makeState = (tiles: Tile[]) => ({
  me: "me",
  tiles: new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile])),
  camX: 0,
  camY: 0,
  camSubX: 0.5,
  camSubY: 0.5,
  selected: undefined as { x: number; y: number } | undefined
});

describe("findHomeAfcTile", () => {
  it("picks the viewer's oldest AFC and ignores other players' AFCs", () => {
    const state = makeState([afcTile(1, 1, "enemy", 1), afcTile(5, 5, "me", 900), afcTile(9, 9, "me", 100)]);
    expect(findHomeAfcTile(state)).toMatchObject({ x: 9, y: 9 });
  });

  it("returns undefined when no owned AFC is loaded", () => {
    expect(findHomeAfcTile(makeState([afcTile(1, 1, "enemy", 1)]))).toBeUndefined();
  });
});

describe("locateHomeAfc", () => {
  it("centers the camera on the AFC, selects it and opens its tile menu", () => {
    const state = makeState([afcTile(12, 34, "me", 100)]);
    const openTileMenu = vi.fn();

    expect(locateHomeAfc(state, openTileMenu, { x: 400, y: 300 })).toBe(true);

    expect(state).toMatchObject({ camX: 12, camY: 34, camSubX: 0, camSubY: 0, selected: { x: 12, y: 34 } });
    expect(openTileMenu).toHaveBeenCalledWith(expect.objectContaining({ x: 12, y: 34 }), 400, 300);
  });

  it("leaves the camera alone and reports false when no AFC is known", () => {
    const state = makeState([]);
    const openTileMenu = vi.fn();
    expect(locateHomeAfc(state, openTileMenu, { x: 0, y: 0 })).toBe(false);
    expect(state.camX).toBe(0);
    expect(openTileMenu).not.toHaveBeenCalled();
  });
});
