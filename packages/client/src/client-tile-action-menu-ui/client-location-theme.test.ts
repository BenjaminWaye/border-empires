import { describe, expect, it } from "vitest";
import { isTileInOngoingBattle, locationThemeForTile } from "./client-location-theme.js";
import { createInitialState, type ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

const NOW = 1_000_000;

const tileAt = (extra: Partial<Tile> = {}): Tile => ({ x: 5, y: 7, terrain: "LAND", ...extra }) as Tile;

const resolvedBattle = (endAt: number): Parameters<ClientState["activeBattles"]["set"]>[1] =>
  ({ originX: 4, originY: 7, targetX: 5, targetY: 7, attackerOwnerId: "p1", defenderOwnerId: "p2", attackerWon: true, startAt: NOW - 1_000, clashAt: NOW, endAt, fromSkirmish: false }) as Parameters<ClientState["activeBattles"]["set"]>[1];

describe("isTileInOngoingBattle", () => {
  it("is false for a quiet tile", () => {
    expect(isTileInOngoingBattle(createInitialState(), tileAt(), NOW)).toBe(false);
  });

  it("is true while a resolved battle's combat animation is still playing, false once it ends", () => {
    const state = createInitialState();
    state.activeBattles.set("5,7", resolvedBattle(NOW + 500));
    expect(isTileInOngoingBattle(state, tileAt(), NOW)).toBe(true);
    expect(isTileInOngoingBattle(state, tileAt(), NOW + 500)).toBe(false);
  });

  it("is true for the viewer's own manual attack on the tile, but not a frontier expansion", () => {
    const state = createInitialState();
    state.capture = { startAt: NOW - 1_000, resolvesAt: NOW + 2_000, target: { x: 5, y: 7 }, actionType: "ATTACK" };
    expect(isTileInOngoingBattle(state, tileAt(), NOW)).toBe(true);
    state.capture = { ...state.capture, actionType: "EXPAND" };
    expect(isTileInOngoingBattle(state, tileAt(), NOW)).toBe(false);
  });

  it("is true for an outgoing muster attack, but not a muster expansion", () => {
    const state = createInitialState();
    state.outgoingMusterAttacksByTile.set("5,7", { originX: 4, originY: 7, targetX: 5, targetY: 7, resolvesAt: NOW + 2_000 });
    expect(isTileInOngoingBattle(state, tileAt(), NOW)).toBe(true);
    state.outgoingMusterAttacksByTile.set("5,7", { originX: 4, originY: 7, targetX: 5, targetY: 7, resolvesAt: NOW + 2_000, isExpand: true });
    expect(isTileInOngoingBattle(state, tileAt(), NOW)).toBe(false);
  });

  it("counts an incoming attack once it has arrived, not while the company is still marching in", () => {
    const state = createInitialState();
    state.me = "me";
    state.incomingAttacksByTile.set("5,7", { attackerName: "Rival", resolvesAt: NOW + 5_000, transitEndsAt: NOW + 1_000 });
    expect(isTileInOngoingBattle(state, tileAt({ ownerId: "me" }), NOW)).toBe(false);
    expect(isTileInOngoingBattle(state, tileAt({ ownerId: "me" }), NOW + 1_000)).toBe(true);
  });

  it("ignores a lingering incoming attack on a tile that has already changed hands", () => {
    const state = createInitialState();
    state.me = "me";
    state.incomingAttacksByTile.set("5,7", { attackerName: "Rival", resolvesAt: NOW + 5_000 });
    expect(isTileInOngoingBattle(state, tileAt({ ownerId: "rival" }), NOW)).toBe(false);
  });

  it("stays silent for an attack on undefended FRONTIER ground, but plays once a capture hold garrisons it", () => {
    const state = createInitialState();
    state.me = "me";
    state.capture = { startAt: NOW - 1_000, resolvesAt: NOW + 2_000, target: { x: 5, y: 7 }, actionType: "ATTACK" };
    state.outgoingMusterAttacksByTile.set("5,7", { originX: 4, originY: 7, targetX: 5, targetY: 7, resolvesAt: NOW + 2_000 });
    const frontier = tileAt({ ownerId: "rival", ownershipState: "FRONTIER" });
    expect(isTileInOngoingBattle(state, frontier, NOW)).toBe(false);
    const garrisoned = tileAt({ ownerId: "rival", ownershipState: "FRONTIER", captureHoldUntil: NOW + 30_000 });
    expect(isTileInOngoingBattle(state, garrisoned, NOW)).toBe(true);
  });

  it("stays silent for an arrived incoming attack on the viewer's undefended FRONTIER tile", () => {
    const state = createInitialState();
    state.me = "me";
    state.incomingAttacksByTile.set("5,7", { attackerName: "Rival", resolvesAt: NOW + 5_000 });
    expect(isTileInOngoingBattle(state, tileAt({ ownerId: "me", ownershipState: "FRONTIER" }), NOW)).toBe(false);
    expect(isTileInOngoingBattle(state, tileAt({ ownerId: "me", ownershipState: "SETTLED" }), NOW)).toBe(true);
  });

  it("is false on a fogged tile even if stale battle state lingers", () => {
    const state = createInitialState();
    state.activeBattles.set("5,7", resolvedBattle(NOW + 500));
    expect(isTileInOngoingBattle(state, tileAt({ fogged: true }), NOW)).toBe(false);
  });
});

describe("locationThemeForTile", () => {
  it("plays the battle cue over a town's own theme while the town is under attack", () => {
    const state = createInitialState();
    const town = tileAt({ town: { populationTier: "TOWN" } as NonNullable<Tile["town"]> });
    expect(locationThemeForTile(state, town, NOW)).toBe("town");
    state.activeBattles.set("5,7", resolvedBattle(NOW + 500));
    expect(locationThemeForTile(state, town, NOW)).toBe("battle");
  });
});
