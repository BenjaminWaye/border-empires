import { describe, expect, it } from "vitest";
import { computeWarMusicSignals } from "./client-war-music-signal.js";
import type { Tile } from "../client-types.js";

const musterTile = (mode: "HOLD" | "ADVANCE"): Tile =>
  ({ x: 0, y: 0, muster: { ownerId: "p1", amount: 5, mode, updatedAt: 0 } }) as Tile;

const baseState = () => ({
  tiles: new Map<string, Tile>(),
  activeBattles: new Map(),
  incomingAttacksByTile: new Map(),
  musterTransitByTile: new Map(),
  deferredAttackByTile: new Map(),
  pendingMusterAttacks: [] as Array<{
    targetX: number;
    targetY: number;
    fromX: number;
    fromY: number;
    musterTileKey: string;
    dismissed?: boolean;
    musterRequestedAt?: number;
    queuedAt?: number;
  }>
});

describe("computeWarMusicSignals", () => {
  it("stays in combat while an ADVANCE flag persists even after battle FX has expired", () => {
    const state = baseState();
    state.tiles.set("0,0", musterTile("ADVANCE"));
    // activeBattles is empty here, simulating the gap between two skirmishes'
    // FX animations during an ongoing war.
    expect(computeWarMusicSignals(state).combat).toBe(true);
  });

  it("is not in combat when musters are all HOLD and no battle FX is active", () => {
    const state = baseState();
    state.tiles.set("0,0", musterTile("HOLD"));
    expect(computeWarMusicSignals(state).combat).toBe(false);
  });

  it("is in combat for a manual attack with no ADVANCE flag involved", () => {
    const state = baseState();
    state.activeBattles.set("1,1", {} as never);
    expect(computeWarMusicSignals(state).combat).toBe(true);
  });
});
