import { describe, expect, it } from "vitest";
import { computeWarMusicSignals } from "./client-war-music-signal.js";
import type { ActiveTruceView, Tile } from "../client-types.js";

// Diplomacy filtering of the war-music signals: allies, truce partners and
// other empires' fights must not start war music. The map is a patch of
// neutral land (x 10..44, y 10..30); "me" owns (20,20) and (21,20), and a
// neighbour owns (22,20) right on that border.

const NOW = 1_000_000;

const truceWith = (otherPlayerId: string, endsAt = NOW + 60_000): ActiveTruceView => ({
  otherPlayerId,
  otherPlayerName: otherPlayerId,
  startedAt: NOW - 60_000,
  endsAt,
  createdByPlayerId: "me"
});

const land = (x: number, y: number, ownerId?: string, ownershipState: Tile["ownershipState"] = "FRONTIER"): Tile =>
  ({ x, y, terrain: "LAND", ...(ownerId ? { ownerId, ownershipState } : {}) }) as Tile;

const stateWithNeighbour = (neighbourId: string) => {
  const tiles = new Map<string, Tile>();
  for (let x = 10; x <= 44; x += 1) for (let y = 10; y <= 30; y += 1) tiles.set(`${x},${y}`, land(x, y));
  tiles.set("20,20", land(20, 20, "me"));
  tiles.set("21,20", land(21, 20, "me"));
  tiles.set("22,20", land(22, 20, neighbourId));
  return {
    me: "me",
    allies: [] as string[],
    activeTruces: [] as ActiveTruceView[],
    tiles,
    activeBattles: new Map(),
    warMusicHoldUntil: 0
  };
};

type TestState = ReturnType<typeof stateWithNeighbour>;

const setTile = (state: TestState, tile: Tile): void => {
  state.tiles.set(`${tile.x},${tile.y}`, tile);
};

// Defaults to an ADVANCE flag with no manpower staged yet: the sim reports a
// cooldown (nextActionAt) with insufficientManpower and never
// noTargetInRange, even when nothing hostile is around -- the case that kept
// war music playing through a truce.
const raiseFlag = (state: TestState, mode: "HOLD" | "ADVANCE" | "MARCH", ownerId = "me", x = 20, y = 20, extra: object = {}): void => {
  const base = state.tiles.get(`${x},${y}`) ?? land(x, y, ownerId);
  setTile(state, {
    ...base,
    muster: { ownerId, amount: 0, mode, updatedAt: 0, ...(mode === "HOLD" ? {} : { nextActionAt: NOW + 5_000, insufficientManpower: true }), ...extra }
  } as Tile);
};

describe("computeWarMusicSignals diplomacy filter: own flags", () => {
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

  it("counts barbarians reachable over neutral land even when every player is at truce", () => {
    const state = stateWithNeighbour("rival");
    state.activeTruces.push(truceWith("rival"));
    setTile(state, land(15, 24, "barbarian", "BARBARIAN"));
    raiseFlag(state, "ADVANCE");
    expect(computeWarMusicSignals(state, NOW).combat).toBe(true);
  });

  it("stays calm when the only barbarians sit behind a truce partner's land", () => {
    const state = stateWithNeighbour("rival");
    state.activeTruces.push(truceWith("rival"));
    // Wall our two tiles in with the truce partner's land; barbarians beyond it.
    for (let x = 19; x <= 22; x += 1) for (let y = 19; y <= 21; y += 1) if (y !== 20 || x === 19 || x === 22) setTile(state, land(x, y, "rival"));
    setTile(state, land(24, 20, "barbarian", "BARBARIAN"));
    raiseFlag(state, "ADVANCE");
    expect(computeWarMusicSignals(state, NOW).combat).toBe(false);
  });

  it("stays calm when the only barbarians are across water", () => {
    const state = stateWithNeighbour("rival");
    state.activeTruces.push(truceWith("rival"));
    for (let y = 10; y <= 30; y += 1) setTile(state, { x: 18, y, terrain: "SEA" } as Tile);
    setTile(state, land(16, 20, "barbarian", "BARBARIAN"));
    raiseFlag(state, "ADVANCE");
    expect(computeWarMusicSignals(state, NOW).combat).toBe(false);
  });

  it("ignores a fogged (stale) hostile tile in reach", () => {
    const state = stateWithNeighbour("rival");
    state.activeTruces.push(truceWith("rival"));
    setTile(state, { ...land(15, 20, "barbarian", "BARBARIAN"), fogged: true });
    raiseFlag(state, "ADVANCE");
    expect(computeWarMusicSignals(state, NOW).combat).toBe(false);
  });

  it("stays calm for an own flag with only neutral land in reach", () => {
    const state = stateWithNeighbour("rival");
    state.tiles.set("22,20", land(22, 20));
    raiseFlag(state, "HOLD");
    expect(computeWarMusicSignals(state, NOW).tension).toBe(false);
  });

  it("is in combat for an own March aimed at hostile land beyond flag reach", () => {
    const state = stateWithNeighbour("rival");
    state.activeTruces.push(truceWith("rival"));
    setTile(state, land(44, 20, "enemy"));
    raiseFlag(state, "MARCH", "me", 20, 20, { targetX: 44, targetY: 20, insufficientManpower: undefined });
    expect(computeWarMusicSignals(state, NOW).combat).toBe(true);
  });

  it("is in combat for an own attack in flight at hostile land beyond flag reach (e.g. across a dock)", () => {
    const state = stateWithNeighbour("rival");
    state.activeTruces.push(truceWith("rival"));
    setTile(state, land(44, 20, "enemy"));
    raiseFlag(state, "ADVANCE", "me", 20, 20, { inFlight: true, inFlightCount: 1, fightX: 44, fightY: 20, nextActionAt: undefined });
    expect(computeWarMusicSignals(state, NOW).combat).toBe(true);
  });

  it("stays calm for an own March expanding into neutral land", () => {
    const state = stateWithNeighbour("rival");
    state.activeTruces.push(truceWith("rival"));
    raiseFlag(state, "MARCH", "me", 20, 20, { targetX: 30, targetY: 20, inFlight: true, inFlightCount: 1, fightX: 19, fightY: 20 });
    expect(computeWarMusicSignals(state, NOW).combat).toBe(false);
  });
});

describe("computeWarMusicSignals diplomacy filter: other empires", () => {
  it("ignores a truce partner's ADVANCE flag on our border", () => {
    const state = stateWithNeighbour("rival");
    state.activeTruces.push(truceWith("rival"));
    raiseFlag(state, "ADVANCE", "rival", 22, 20, { inFlight: true, inFlightCount: 1, fightX: 21, fightY: 20 });
    expect(computeWarMusicSignals(state, NOW).combat).toBe(false);
  });

  it("is in combat for a hostile empire's flag fighting our land, even from beyond the border radius", () => {
    const state = stateWithNeighbour("rival");
    setTile(state, land(30, 20, "rival"));
    raiseFlag(state, "ADVANCE", "rival", 30, 20, { inFlight: true, inFlightCount: 1, fightX: 21, fightY: 20 });
    expect(computeWarMusicSignals(state, NOW).combat).toBe(true);
  });

  it("is only tension for a hostile empire's engaged flag near our border fighting someone else", () => {
    const state = stateWithNeighbour("rival");
    setTile(state, land(23, 20, "third"));
    raiseFlag(state, "ADVANCE", "rival", 22, 20, { inFlight: true, inFlightCount: 1, fightX: 23, fightY: 20 });
    const result = computeWarMusicSignals(state, NOW);
    expect(result.combat).toBe(false);
    expect(result.tension).toBe(true);
  });

  it("is tension for a hostile empire's HOLD flag near our border", () => {
    const state = stateWithNeighbour("rival");
    raiseFlag(state, "HOLD", "rival", 22, 20);
    expect(computeWarMusicSignals(state, NOW).tension).toBe(true);
  });

  it("ignores a fogged hostile flag", () => {
    const state = stateWithNeighbour("rival");
    setTile(state, { ...land(22, 20, "rival"), fogged: true });
    raiseFlag(state, "ADVANCE", "rival", 22, 20, { inFlight: true, inFlightCount: 1, fightX: 21, fightY: 20 });
    const result = computeWarMusicSignals(state, NOW);
    expect(result.combat).toBe(false);
    expect(result.tension).toBe(false);
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
    state.activeBattles.set("23,20", { attackerOwnerId: "barbarian", defenderOwnerId: "me" } as never);
    expect(computeWarMusicSignals(state, NOW).combat).toBe(true);
  });
});
