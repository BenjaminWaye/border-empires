import { describe, expect, it } from "vitest";
import { computeWarMusicSignals } from "./client-war-music-signal.js";
import type { Tile } from "../client-types.js";

const musterTile = (mode: "HOLD" | "ADVANCE" | "MARCH"): Tile =>
  ({ x: 0, y: 0, muster: { ownerId: "p1", amount: 5, mode, updatedAt: 0 } }) as Tile;

const baseState = () => ({
  tiles: new Map<string, Tile>(),
  activeBattles: new Map(),
  warMusicHoldUntil: 0
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

  it("is in combat as soon as a March-To target is set, with no attack yet resolved", () => {
    const state = baseState();
    state.tiles.set("0,0", musterTile("MARCH"));
    expect(computeWarMusicSignals(state).combat).toBe(true);
  });

  it("holds combat music for a while after a manual attack's activeBattle clears", () => {
    const state = baseState();
    state.activeBattles.set("1,1", {} as never);
    const t0 = 1_000_000;
    expect(computeWarMusicSignals(state, t0).combat).toBe(true);
    state.activeBattles.clear();
    // Just after the battle clears, combat should still hold.
    expect(computeWarMusicSignals(state, t0 + 1000).combat).toBe(true);
    // Once the hold window has fully elapsed, it drops back out.
    expect(computeWarMusicSignals(state, t0 + 2 * 60 * 1000 + 1).combat).toBe(false);
  });
});
