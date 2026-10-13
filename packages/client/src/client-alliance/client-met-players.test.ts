import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { isMeetablePlayerId, refreshMetPlayerIds, resetMetPlayers } from "./client-met-players.js";

const tileOwnedBy = (x: number, ownerId?: string): Tile => ({ x, y: 0, terrain: "LAND", ...(ownerId ? { ownerId } : {}) }) as Tile;

const makeState = (tiles: Tile[], me = "me") => ({
  me,
  tiles: new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile])),
  tilesRevision: 1,
  metPlayerIds: new Set<string>(),
  metPlayersScannedRevision: -1
});

describe("refreshMetPlayerIds", () => {
  it("counts a player as met once any of their territory has been seen", () => {
    const state = makeState([tileOwnedBy(0, "me"), tileOwnedBy(1), tileOwnedBy(2, "player-7"), tileOwnedBy(3, "ai-2")]);
    expect([...refreshMetPlayerIds(state)].sort()).toEqual(["ai-2", "player-7"]);
  });

  it("never counts yourself, barbarians or Planetary Defense", () => {
    const state = makeState([tileOwnedBy(0, "me"), tileOwnedBy(1, "barbarian"), tileOwnedBy(2, "barbarian-1")]);
    expect(refreshMetPlayerIds(state).size).toBe(0);
    expect(isMeetablePlayerId("barbarian-1", "me")).toBe(false);
    expect(isMeetablePlayerId(undefined, "me")).toBe(false);
  });

  it("keeps a player met after their tiles are no longer on the map", () => {
    const state = makeState([tileOwnedBy(2, "player-7")]);
    refreshMetPlayerIds(state);
    state.tiles.clear();
    state.tilesRevision += 1;
    expect(refreshMetPlayerIds(state).has("player-7")).toBe(true);
  });

  it("only rescans tiles when the tile revision changed", () => {
    const state = makeState([tileOwnedBy(2, "player-7")]);
    refreshMetPlayerIds(state);
    state.tiles.set("9,0", tileOwnedBy(9, "player-9"));
    expect(refreshMetPlayerIds(state).has("player-9")).toBe(false);
    state.tilesRevision += 1;
    expect(refreshMetPlayerIds(state).has("player-9")).toBe(true);
  });

  it("forgets everyone on season reset", () => {
    const state = makeState([tileOwnedBy(2, "player-7")]);
    refreshMetPlayerIds(state);
    resetMetPlayers(state);
    state.tiles.clear();
    expect(refreshMetPlayerIds(state).size).toBe(0);
  });
});
