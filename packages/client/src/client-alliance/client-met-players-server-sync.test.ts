// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { registerHintStateSender } from "../client-discovery-tips/client-hint-server-sync.js";
import { clearMetPlayersForNewWorld, hydrateMetPlayersFromServer, refreshMetPlayerIds } from "./client-met-players.js";

// Playtest run 5: a fresh browser showed "Empires you've met · 0", and rivals fought or truced the day
// before were gone, because the set lived only in this browser's localStorage. It is now also kept on
// the gateway's player profile.

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

const sent: Array<Record<string, unknown>> = [];

beforeEach(() => {
  window.localStorage.clear();
  sent.length = 0;
  registerHintStateSender((patch) => sent.push(patch));
});
afterEach(() => vi.restoreAllMocks());

describe("met empires on the server", () => {
  it("brings back empires met on another device or before site data was cleared", () => {
    const state = makeState([]);
    hydrateMetPlayersFromServer(state, ["ai-henrik", "player-7"], "season-1");
    expect([...refreshMetPlayerIds(state)].sort()).toEqual(["ai-henrik", "player-7"]);
  });

  it("ignores another season's set, barbarians and yourself", () => {
    const state = makeState([]);
    hydrateMetPlayersFromServer(state, ["ai-old"], "season-0");
    hydrateMetPlayersFromServer(state, ["barbarian-1", "me", 7], "season-1");
    expect(refreshMetPlayerIds(state).size).toBe(0);
  });

  it("sends the whole set for this season when it grows, never an empty one", () => {
    const state = makeState([tileOwnedBy(0, "me")]);
    refreshMetPlayerIds(state);
    expect(sent).toEqual([]);
    state.tiles.set("2,0", tileOwnedBy(2, "ai-2"));
    state.tilesRevision += 1;
    refreshMetPlayerIds(state);
    expect(sent).toEqual([{ metPlayerIds: ["ai-2"], metPlayersSeasonId: "season-1" }]);
  });

  it("clears the server's copy when the world is regenerated", () => {
    const state = makeState([tileOwnedBy(2, "ai-2")]);
    refreshMetPlayerIds(state);
    clearMetPlayersForNewWorld(state);
    expect(sent.at(-1)).toEqual({ metPlayerIds: [], metPlayersSeasonId: "season-1" });
  });
});
