import { describe, expect, it } from "vitest";
import { computeWarMusicSignals } from "./client-war-music-signal.js";
import type { ActiveTruceView, Tile } from "../client-types.js";

// Diplomacy filtering of the war-music signals: allies, truce partners and
// other empires' fights must not start war music. "me" owns a strip of land
// around (0,0); a neighbour owns the tile at (3,0), inside flag reach.

const NOW = 1_000_000;

const truceWith = (otherPlayerId: string, endsAt = NOW + 60_000): ActiveTruceView => ({
  otherPlayerId,
  otherPlayerName: otherPlayerId,
  startedAt: NOW - 60_000,
  endsAt,
  createdByPlayerId: "me"
});

const owned = (x: number, y: number, ownerId: string, ownershipState: Tile["ownershipState"] = "FRONTIER"): Tile =>
  ({ x, y, ownerId, ownershipState }) as Tile;

const stateWithNeighbour = (neighbourId: string) => ({
  me: "me",
  allies: [] as string[],
  activeTruces: [] as ActiveTruceView[],
  tiles: new Map<string, Tile>([
    ["0,0", owned(0, 0, "me")],
    ["1,0", owned(1, 0, "me")],
    ["3,0", owned(3, 0, neighbourId)]
  ]),
  activeBattles: new Map(),
  warMusicHoldUntil: 0
});

type TestState = ReturnType<typeof stateWithNeighbour>;

// An ADVANCE flag with no manpower staged yet: the sim reports a cooldown
// (nextActionAt) with insufficientManpower and never noTargetInRange, even
// when nothing hostile is around -- the case that kept war music playing
// through a truce.
const raiseFlag = (state: TestState, mode: "HOLD" | "ADVANCE" | "MARCH", ownerId = "me", x = 0, y = 0, extra: object = {}): void => {
  const base = state.tiles.get(`${x},${y}`) ?? owned(x, y, ownerId);
  state.tiles.set(`${x},${y}`, {
    ...base,
    muster: { ownerId, amount: 0, mode, updatedAt: 0, ...(mode === "HOLD" ? {} : { nextActionAt: NOW + 5_000, insufficientManpower: true }), ...extra }
  } as Tile);
};

describe("computeWarMusicSignals diplomacy filter", () => {
  it("stays calm for an own ADVANCE flag whose only neighbour is a truce partner", () => {
    const state = stateWithNeighbour("rival");
    state.activeTruces.push(truceWith("rival"));
    raiseFlag(state, "ADVANCE");
    const result = computeWarMusicSignals(state, NOW);
    expect(result.combat).toBe(false);
    expect(state.warMusicHoldUntil).toBe(0);
  });

  it("stays calm for an own HOLD flag whose only neighbour is an ally", () => {
    const state = stateWithNeighbour("friend");
    state.allies.push("friend");
    raiseFlag(state, "HOLD");
    expect(computeWarMusicSignals(state, NOW).tension).toBe(false);
  });

  it("plays war music again once the truce has run out", () => {
    const state = stateWithNeighbour("rival");
    state.activeTruces.push(truceWith("rival", NOW - 1));
    raiseFlag(state, "ADVANCE");
    expect(computeWarMusicSignals(state, NOW).combat).toBe(true);
  });

  it("counts barbarians in reach as hostile even when every player is at truce", () => {
    const state = stateWithNeighbour("rival");
    state.activeTruces.push(truceWith("rival"));
    state.tiles.set("5,4", owned(5, 4, "barbarian", "BARBARIAN"));
    raiseFlag(state, "ADVANCE");
    expect(computeWarMusicSignals(state, NOW).combat).toBe(true);
  });

  it("stays calm for an own flag with only neutral land in reach", () => {
    const state = stateWithNeighbour("rival");
    state.tiles.delete("3,0");
    raiseFlag(state, "HOLD");
    expect(computeWarMusicSignals(state, NOW).tension).toBe(false);
  });

  it("is in combat for an own March aimed at hostile land beyond flag reach", () => {
    const state = stateWithNeighbour("rival");
    state.activeTruces.push(truceWith("rival"));
    state.tiles.set("40,0", owned(40, 0, "enemy"));
    raiseFlag(state, "MARCH", "me", 0, 0, { targetX: 40, targetY: 0, insufficientManpower: undefined });
    expect(computeWarMusicSignals(state, NOW).combat).toBe(true);
  });

  it("ignores a truce partner's ADVANCE flag on our border", () => {
    const state = stateWithNeighbour("rival");
    state.activeTruces.push(truceWith("rival"));
    raiseFlag(state, "ADVANCE", "rival", 3, 0, { inFlight: true, inFlightCount: 1 });
    expect(computeWarMusicSignals(state, NOW).combat).toBe(false);
  });

  it("is in combat for a hostile empire's engaged flag on our border", () => {
    const state = stateWithNeighbour("rival");
    raiseFlag(state, "ADVANCE", "rival", 3, 0, { inFlight: true, inFlightCount: 1 });
    expect(computeWarMusicSignals(state, NOW).combat).toBe(true);
  });

  it("ignores a visible battle between two other empires", () => {
    const state = stateWithNeighbour("rival");
    state.activeBattles.set("9,9", { attackerOwnerId: "rival", defenderOwnerId: "enemy" } as never);
    expect(computeWarMusicSignals(state, NOW).combat).toBe(false);
    expect(state.warMusicHoldUntil).toBe(0);
  });

  it("is in combat for a battle we fight against a barbarian", () => {
    const state = stateWithNeighbour("rival");
    state.activeTruces.push(truceWith("rival"));
    state.activeBattles.set("2,0", { attackerOwnerId: "barbarian", defenderOwnerId: "me" } as never);
    expect(computeWarMusicSignals(state, NOW).combat).toBe(true);
  });
});
