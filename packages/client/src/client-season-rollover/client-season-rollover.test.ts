// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { refreshMetPlayerIds } from "../client-alliance/client-met-players.js";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { resetClientForNewSeason } from "./client-season-rollover.js";

// Regression: "met players" is derived from the season's tiles. If a rollover
// kept the previous season's set, the Alliances tab would offer proposals to
// players the new season's map has not shown you yet.
describe("resetClientForNewSeason", () => {
  it("forgets which players were met in the previous season", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set("1,1", { x: 1, y: 1, terrain: "LAND", ownerId: "player-7" } as Tile);
    state.tilesRevision += 1;
    expect(refreshMetPlayerIds(state).has("player-7")).toBe(true);

    resetClientForNewSeason(state);

    expect(state.metPlayerIds.size).toBe(0);
    state.tilesRevision += 1;
    expect(refreshMetPlayerIds(state).size).toBe(0);
  });
});
