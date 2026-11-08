import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { findHomeAfcTile } from "./client-afc-locate.js";

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
