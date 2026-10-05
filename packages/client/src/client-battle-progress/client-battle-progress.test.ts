import { describe, expect, it } from "vitest";
import { battleOverviewLines } from "./client-tracked-battle-progress.js";
import { captureAttackProgressView, incomingAttackProgressView } from "./client-battle-progress.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

const baseState = (): ClientState =>
  ({
    me: "me-1",
    meName: "Me",
    playerNames: new Map([["enemy-1", "Enemy One"]]),
    playerColors: new Map([
      ["me-1", "#00ff00"],
      ["enemy-1", "#ff0000"]
    ]),
    leaderboard: { overall: [], byTiles: [], byIncome: [], byTechs: [] },
    capture: undefined,
    incomingAttacksByTile: new Map(),
    outgoingMusterAttacksByTile: new Map(),
    activeBattles: new Map()
  }) as unknown as ClientState;

const tile = (overrides: Partial<Tile> = {}): Tile => ({ x: 5, y: 5, terrain: "LAND", ownershipState: "SETTLED", ...overrides } as Tile);

describe("captureAttackProgressView", () => {
  it("returns undefined when there is no capture targeting this tile", () => {
    expect(captureAttackProgressView(baseState(), tile(), () => "0:05")).toBeUndefined();
  });

  it("shows a versus bar with the pre-battle odds snapshot for an outgoing attack", () => {
    const state = baseState();
    state.capture = {
      startAt: Date.now() - 1000,
      resolvesAt: Date.now() + 2000,
      target: { x: 5, y: 5 },
      actionType: "ATTACK",
      combatSnapshot: { winChance: 0.7, attackerEffective: 100, defenderEffective: 40, defenderOwnerId: "enemy-1" }
    };
    const view = captureAttackProgressView(state, tile({ ownerId: "enemy-1" }), () => "0:02");
    expect(view?.title).toBe("Battle in progress");
    expect(view?.battle).toEqual({
      attackerColor: "#00ff00",
      defenderColor: "#ff0000",
      attackerShare: 0.7,
      attackerLabel: "You",
      defenderLabel: "Enemy One"
    });
  });

  it("omits the versus bar when no odds snapshot was captured at dispatch time", () => {
    const state = baseState();
    state.capture = { startAt: Date.now() - 1000, resolvesAt: Date.now() + 2000, target: { x: 5, y: 5 }, actionType: "ATTACK" };
    const view = captureAttackProgressView(state, tile({ ownerId: "enemy-1" }), () => "0:02");
    expect(view?.title).toBe("Battle in progress");
    expect(view?.battle).toBeUndefined();
  });

  it("falls back to the live attack preview when no snapshot was captured at dispatch", () => {
    const state = baseState();
    state.capture = { startAt: Date.now() - 1000, resolvesAt: Date.now() + 2000, target: { x: 5, y: 5 }, actionType: "ATTACK" };
    const view = captureAttackProgressView(state, tile({ ownerId: "enemy-1" }), () => "0:02", () => 0.62);
    expect(view?.battle?.attackerShare).toBe(0.62);
    expect(view?.detail).toBe("Chance of winning: 62% you, 38% Enemy One.");
  });

  it("prefers the dispatch-time snapshot over the live preview", () => {
    const state = baseState();
    state.capture = {
      startAt: Date.now() - 1000, resolvesAt: Date.now() + 2000, target: { x: 5, y: 5 }, actionType: "ATTACK",
      combatSnapshot: { winChance: 0.7, attackerEffective: 100, defenderEffective: 40, defenderOwnerId: "enemy-1" }
    };
    const view = captureAttackProgressView(state, tile({ ownerId: "enemy-1" }), () => "0:02", () => 0.1);
    expect(view?.battle?.attackerShare).toBe(0.7);
  });

  it("still shows the plain expansion card for a non-attack capture", () => {
    const state = baseState();
    state.capture = { startAt: Date.now() - 1000, resolvesAt: Date.now() + 2000, target: { x: 5, y: 5 }, actionType: "EXPAND" };
    const view = captureAttackProgressView(state, tile(), () => "0:02");
    expect(view?.title).toBe("Frontier expansion in progress");
    expect(view?.battle).toBeUndefined();
  });
});

describe("incomingAttackProgressView", () => {
  const keyFor = (x: number, y: number): string => `${x},${y}`;

  it("returns undefined for a tile the viewer doesn't own", () => {
    const state = baseState();
    state.incomingAttacksByTile.set("5,5", { attackerName: "Enemy One", resolvesAt: Date.now() + 2000, attackerId: "enemy-1" });
    expect(incomingAttackProgressView(state, tile({ ownerId: "enemy-1" }), keyFor, () => "0:02")).toBeUndefined();
  });

  it("returns undefined when there is no incoming attack recorded for this tile", () => {
    const state = baseState();
    expect(incomingAttackProgressView(state, tile({ ownerId: "me-1" }), keyFor, () => "0:02")).toBeUndefined();
  });

  // Regression: the defender used to get a placeholder 50/50 versus bar,
  // which read as real odds.
  it("shows the defender their own chance of holding, from the locked odds in the alert", () => {
    const state = baseState();
    state.incomingAttacksByTile.set("5,5", { attackerName: "Enemy One", attackerId: "enemy-1", resolvesAt: Date.now() + 2000, winChance: 0.7 });
    const view = incomingAttackProgressView(state, tile({ ownerId: "me-1", ownershipState: "SETTLED" }), (x, y) => `${x},${y}`, () => "0:02");
    expect(view?.detail).toBe("Chance of holding this tile: 30% you, 70% Enemy One.");
    expect(view?.battle).toEqual({
      attackerColor: "#ff0000", defenderColor: "#00ff00", attackerShare: 0.7, attackerLabel: "Enemy One", defenderLabel: "You"
    });
  });

  it("shows no versus bar for the defender of a settled tile", () => {
    const state = baseState();
    state.incomingAttacksByTile.set("5,5", { attackerName: "Enemy One", resolvesAt: Date.now() + 2000, attackerId: "enemy-1" });
    const view = incomingAttackProgressView(state, tile({ ownerId: "me-1" }), keyFor, () => "0:02");
    expect(view?.title).toBe("Under attack");
    expect(view?.battle).toBeUndefined();
    expect(view?.note).toContain("already rolled");
  });

  it("explains a FRONTIER tile is a guaranteed capture with no roll", () => {
    const state = baseState();
    state.incomingAttacksByTile.set("5,5", { attackerName: "Enemy One", resolvesAt: Date.now() + 2000, attackerId: "enemy-1" });
    const view = incomingAttackProgressView(state, tile({ ownerId: "me-1", ownershipState: "FRONTIER" }), keyFor, () => "0:02");
    expect(view?.title).toBe("Being captured");
    expect(view?.detail).toContain("no defending force");
    expect(view?.battle).toBeUndefined();
  });

  it("says the enemy company is still marching while its transit runs", () => {
    const state = baseState();
    state.incomingAttacksByTile.set("5,5", {
      attackerName: "Enemy One",
      resolvesAt: Date.now() + 60_000,
      transitEndsAt: Date.now() + 30_000,
      attackerId: "enemy-1"
    });
    const view = incomingAttackProgressView(state, tile({ ownerId: "me-1", ownershipState: "FRONTIER" }), keyFor, () => "0:30");
    expect(view?.title).toBe("Attack incoming");
    expect(view?.detail).toContain("marching here");
    expect(view?.progress).toBe(0);
  });
});


describe("battle details from map tracking", () => {
  it("shows a muster attack after manual capture state has cleared", () => {
    const state = baseState();
    state.outgoingMusterAttacksByTile.set("5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: Date.now() + 2000 });
    const view = captureAttackProgressView(state, tile({ ownerId: "enemy-1" }), () => "0:02");
    expect(view?.title).toBe("Battle in progress");
    expect(view?.detail).toContain("muster");
    expect(view?.cancelActionId).toBeUndefined();
  });

  it("shows the chance of winning for a muster attack when a preview is available", () => {
    const state = baseState();
    state.outgoingMusterAttacksByTile.set("5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: Date.now() + 2000 });
    const view = captureAttackProgressView(state, tile({ ownerId: "enemy-1" }), () => "0:02", () => 0.25);
    expect(view?.title).toBe("Battle in progress");
    expect(view?.detail).toBe("Chance of winning: 25% you, 75% Enemy One.");
    expect(view?.battle?.attackerShare).toBe(0.25);
  });

  it("prefers the server-locked odds on a muster attack over the live preview", () => {
    const state = baseState();
    state.outgoingMusterAttacksByTile.set("5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: Date.now() + 2000, winChance: 0.4 });
    const view = captureAttackProgressView(state, tile({ ownerId: "enemy-1" }), () => "0:02", () => 0.9);
    expect(view?.battle?.attackerShare).toBe(0.4);
  });

  it("does not mislabel a muster expansion as a battle", () => {
    const state = baseState();
    state.outgoingMusterAttacksByTile.set("5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: Date.now() + 2000, isExpand: true });
    expect(captureAttackProgressView(state, tile(), () => "0:02")).toBeUndefined();
  });

  it("explains a resolved battle still animated on the map, then expires", () => {
    const state = baseState();
    state.activeBattles.set("5,5", {
      originX: 4, originY: 5, targetX: 5, targetY: 5,
      attackerOwnerId: "me-1", defenderOwnerId: "enemy-1", attackerWon: true,
      startAt: Date.now() - 1000, clashAt: Date.now(), endAt: Date.now() + 2000, fromSkirmish: true
    });
    const view = captureAttackProgressView(state, tile({ ownerId: "me-1" }), () => "0:02");
    expect(view?.title).toBe("Battle resolved");
    expect(view?.detail).toContain("You won");
    expect(view?.detail).toContain("animation");
    expect(captureAttackProgressView(state, tile({ fogged: true }), () => "0:02")).toBeUndefined();
    state.activeBattles.get("5,5")!.endAt = Date.now() - 1;
    expect(captureAttackProgressView(state, tile(), () => "0:00")).toBeUndefined();
  });

  it("ignores expired muster attacks", () => {
    const state = baseState();
    state.outgoingMusterAttacksByTile.set("5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: Date.now() - 1 });
    expect(captureAttackProgressView(state, tile(), () => "0:00")).toBeUndefined();
  });
});


it("renders battle participants as text in the overview", () => {
  const lines = battleOverviewLines({
    title: "Battle resolved", detail: '<img src=x onerror="alert(1)"> won this battle.',
    remainingLabel: "0:02", progress: 1, note: "Animation"
  });
  expect(lines[1]?.html).toContain("&lt;img");
  expect(lines[1]?.html).not.toContain("<img");
});
