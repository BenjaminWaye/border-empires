// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { isMeetablePlayerId, MET_PLAYERS_MAX_SAVED, MET_PLAYERS_STORAGE_PREFIX, refreshMetPlayerIds, resetMetPlayers } from "./client-met-players.js";

const tileOwnedBy = (x: number, ownerId?: string): Tile => ({ x, y: 0, terrain: "LAND", ...(ownerId ? { ownerId } : {}) }) as Tile;

const makeState = (tiles: Tile[], me = "me", bridgeDebugSeasonId = "season-1") => ({
  me,
  bridgeDebugSeasonId,
  tiles: new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile])),
  tilesRevision: 1,
  metPlayerIds: new Set<string>(),
  metPlayersScannedRevision: -1,
  metPlayersLoadedFor: "",
  metPlayersSavedCount: -1
});

beforeEach(() => window.localStorage.clear());

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

// Playtest run 2: after a reload, or once a truce partner's land was out of
// view, empires went back to "Not met yet".
describe("met players across a reload", () => {
  it("remembers who you met after the page reloads with none of their land loaded", () => {
    refreshMetPlayerIds(makeState([tileOwnedBy(2, "player-7"), tileOwnedBy(3, "ai-2")]));
    const reloaded = makeState([]);
    expect([...refreshMetPlayerIds(reloaded)].sort()).toEqual(["ai-2", "player-7"]);
  });

  it("keeps each account's and each season's set apart", () => {
    refreshMetPlayerIds(makeState([tileOwnedBy(2, "player-7")]));
    expect(refreshMetPlayerIds(makeState([], "someone-else")).size).toBe(0);
    expect(refreshMetPlayerIds(makeState([], "me", "season-2")).size).toBe(0);
    // A new season overwrote the account's single saved entry, so nothing piles up.
    expect(Object.keys(window.localStorage).filter((key) => key.startsWith(MET_PLAYERS_STORAGE_PREFIX)).sort()).toEqual([`${MET_PLAYERS_STORAGE_PREFIX}me`, `${MET_PLAYERS_STORAGE_PREFIX}someone-else`]);
  });

  it("waits for the account and season before loading, keeping what it scanned meanwhile", () => {
    refreshMetPlayerIds(makeState([tileOwnedBy(2, "player-7")]));
    const state = makeState([tileOwnedBy(4, "ai-9")], "me", "");
    expect([...refreshMetPlayerIds(state)]).toEqual(["ai-9"]);
    state.bridgeDebugSeasonId = "season-1";
    expect([...refreshMetPlayerIds(state)].sort()).toEqual(["ai-9", "player-7"]);
  });

  it("forgets the saved set on a season reset in the same session", () => {
    const state = makeState([tileOwnedBy(2, "player-7")]);
    refreshMetPlayerIds(state);
    resetMetPlayers(state);
    state.tiles.clear();
    state.bridgeDebugSeasonId = "season-2";
    expect(refreshMetPlayerIds(state).size).toBe(0);
    expect(refreshMetPlayerIds(makeState([], "me", "season-1")).size).toBe(0);
  });

  it("caps what it saves and ignores a corrupt entry", () => {
    const tiles = Array.from({ length: MET_PLAYERS_MAX_SAVED + 5 }, (_, index) => tileOwnedBy(index, `player-${index}`));
    refreshMetPlayerIds(makeState(tiles));
    expect(refreshMetPlayerIds(makeState([])).size).toBe(MET_PLAYERS_MAX_SAVED);
    window.localStorage.setItem(`${MET_PLAYERS_STORAGE_PREFIX}me`, "{not json");
    expect(refreshMetPlayerIds(makeState([])).size).toBe(0);
  });
});
