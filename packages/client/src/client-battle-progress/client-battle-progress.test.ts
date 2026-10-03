import { describe, expect, it } from "vitest";
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
    incomingAttacksByTile: new Map()
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
  it("shows no versus bar for the defender of a settled tile", () => {
    const state = baseState();
    state.incomingAttacksByTile.set("5,5", { attackerName: "Enemy One", resolvesAt: Date.now() + 2000, attackerId: "enemy-1" });
    const view = incomingAttackProgressView(state, tile({ ownerId: "me-1" }), keyFor, () => "0:02");
    expect(view?.title).toBe("Under attack");
    expect(view?.battle).toBeUndefined();
    expect(view?.note).toBe("Combat resolves in a single roll when the timer ends.");
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
