import { describe, expect, it } from "vitest";
import { computeWarMusicSignals } from "./client-war-music-signal.js";
import type { Tile } from "../client-types.js";

const musterTile = (mode: "HOLD" | "ADVANCE"): Tile =>
  ({ x: 0, y: 0, muster: { ownerId: "p1", amount: 5, mode, updatedAt: 0 } }) as Tile;

const baseState = () => ({
  tiles: new Map<string, Tile>(),
  activeBattles: new Map()
});

describe("computeWarMusicSignals", () => {
  it("stays in combat while an ADVANCE flag persists even after battle FX has expired", () => {
    const state = baseState();
    state.tiles.set("0,0", musterTile("ADVANCE"));
    // activeBattles is empty here, simulating the gap between two skirmishes'
    // FX animations during an ongoing war.
    expect(computeWarMusicSignals(state).combat).toBe(true);
  });

  it("is in tension, not combat, while a flag is staged at HOLD", () => {
    const state = baseState();
    state.tiles.set("0,0", musterTile("HOLD"));
    const result = computeWarMusicSignals(state);
    expect(result.combat).toBe(false);
    expect(result.tension).toBe(true);
  });

  it("is calm when no muster flags are raised and no battle FX is active", () => {
    const state = baseState();
    const result = computeWarMusicSignals(state);
    expect(result.combat).toBe(false);
    expect(result.tension).toBe(false);
  });

  it("is in combat for a manual attack with no ADVANCE flag involved", () => {
    const state = baseState();
    state.activeBattles.set("1,1", {} as never);
    expect(computeWarMusicSignals(state).combat).toBe(true);
  });

  it("stays combat (not tension) when both an ADVANCE and a HOLD flag are raised", () => {
    const state = baseState();
    state.tiles.set("0,0", musterTile("ADVANCE"));
    state.tiles.set("1,1", musterTile("HOLD"));
    const result = computeWarMusicSignals(state);
    expect(result.combat).toBe(true);
  });
});
