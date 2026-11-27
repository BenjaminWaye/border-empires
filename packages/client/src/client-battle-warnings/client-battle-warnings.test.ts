import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import {
  BATTLE_FLASH_CAP,
  BATTLE_FLASH_MS,
  BATTLE_WARNING_HOLD_MS,
  activeBattleFlashes,
  battleFlashIntensity,
  battleWarningView,
  createBattleWarningStore,
  detectOwnTileLosses,
  dismissBattleWarning,
  recordOwnTileLosses,
  syncIncomingAttacks
} from "./client-battle-warnings.js";

const NOW = 1_800_000_000_000;

const stateFor = (me = "me") => {
  const state = createInitialState();
  state.me = me;
  state.playerNames.set("rival", "House Vale");
  return state;
};

describe("detectOwnTileLosses", () => {
  const previous = new Map<string, { ownerId?: string; optimisticPending?: string }>([
    ["1,1", { ownerId: "me" }],
    ["2,2", { ownerId: "me" }],
    ["3,3", { ownerId: "me", optimisticPending: "expand" }],
    ["4,4", { ownerId: "rival" }],
    ["5,5", { ownerId: "me" }]
  ]);
  const current = new Map<string, string | undefined>([
    ["1,1", "barbarian-1"],
    ["2,2", undefined],
    ["3,3", "rival"],
    ["4,4", "barbarian-1"],
    ["5,5", "me"]
  ]);
  const updates = [1, 2, 3, 4, 5].map((n) => ({ x: n, y: n }));

  it("reports only own tiles captured by another owner", () => {
    const losses = detectOwnTileLosses("me", updates, (x, y) => previous.get(`${x},${y}`), (x, y) => current.get(`${x},${y}`));
    // 2,2 fell to neutral (decay), 3,3 was only our optimistic claim, 4,4 was never ours, 5,5 is still ours.
    expect(losses).toEqual([{ x: 1, y: 1, newOwnerId: "barbarian-1" }]);
  });

  it("reports nothing before the player is known", () => {
    expect(detectOwnTileLosses(undefined, updates, (x, y) => previous.get(`${x},${y}`), (x, y) => current.get(`${x},${y}`))).toEqual([]);
  });
});

describe("battle warning banner", () => {
  it("batches a burst of Planetary Defense captures into one terse alert focused on the latest tile", () => {
    const store = createBattleWarningStore();
    const state = stateFor();
    const losses = Array.from({ length: 8 }, (_, i) => ({ x: 10 + i, y: 4, newOwnerId: "barbarian-1" }));
    recordOwnTileLosses(store, state, losses, NOW);
    recordOwnTileLosses(store, state, [{ x: 30, y: 9, newOwnerId: "barbarian-1" }], NOW + 5_000);
    expect(battleWarningView(store, state, NOW + 5_000)).toEqual({
      title: "Under attack",
      detail: "Insurgents · 9 tiles lost",
      focusX: 30,
      focusY: 9
    });
  });

  it("names the latest attacker and counts the others", () => {
    const store = createBattleWarningStore();
    const state = stateFor();
    recordOwnTileLosses(store, state, [{ x: 1, y: 1, newOwnerId: "barbarian-1" }], NOW);
    recordOwnTileLosses(store, state, [{ x: 2, y: 2, newOwnerId: "rival" }], NOW + 1_000);
    expect(battleWarningView(store, state, NOW + 1_000)?.detail).toBe("House Vale +1 · 2 tiles lost");
  });

  it("expires after the hold window and starts a fresh count for the next fight", () => {
    const store = createBattleWarningStore();
    const state = stateFor();
    recordOwnTileLosses(store, state, [{ x: 1, y: 1, newOwnerId: "rival" }, { x: 2, y: 1, newOwnerId: "rival" }], NOW);
    expect(battleWarningView(store, state, NOW + BATTLE_WARNING_HOLD_MS + 1)).toBeUndefined();
    recordOwnTileLosses(store, state, [{ x: 3, y: 1, newOwnerId: "rival" }], NOW + BATTLE_WARNING_HOLD_MS + 2);
    expect(battleWarningView(store, state, NOW + BATTLE_WARNING_HOLD_MS + 2)?.detail).toBe("House Vale · 1 tile lost");
  });

  it("warns about an incoming attack before it resolves, once per attack", () => {
    const store = createBattleWarningStore();
    const state = stateFor();
    state.incomingAttacksByTile.set("7,8", { attackerName: "House Vale", attackerId: "rival", resolvesAt: NOW + 10_000 });
    syncIncomingAttacks(store, state, NOW);
    expect(battleWarningView(store, state, NOW)).toEqual({ title: "Under attack", detail: "House Vale · 1 incoming", focusX: 7, focusY: 8 });
    dismissBattleWarning(store);
    syncIncomingAttacks(store, state, NOW + 1_000);
    expect(battleWarningView(store, state, NOW + 1_000)).toBeUndefined();
    // A new attack on another tile raises it again.
    state.incomingAttacksByTile.set("9,9", { attackerName: "Planetary Defense", attackerId: "barbarian-1", resolvesAt: NOW + 12_000 });
    syncIncomingAttacks(store, state, NOW + 2_000);
    expect(battleWarningView(store, state, NOW + 2_000)?.detail).toBe("Insurgents +1 · 2 incoming");
  });

  it("ignores incoming attacks that already resolved", () => {
    const store = createBattleWarningStore();
    const state = stateFor();
    state.incomingAttacksByTile.set("7,8", { attackerName: "House Vale", attackerId: "rival", resolvesAt: NOW - 1 });
    syncIncomingAttacks(store, state, NOW);
    expect(battleWarningView(store, state, NOW)).toBeUndefined();
  });

  it("resets when the player changes (new season / account)", () => {
    const store = createBattleWarningStore();
    recordOwnTileLosses(store, stateFor("me"), [{ x: 1, y: 1, newOwnerId: "rival" }], NOW);
    const other = stateFor("someone-else");
    syncIncomingAttacks(store, other, NOW + 1);
    expect(battleWarningView(store, other, NOW + 1)).toBeUndefined();
    expect(activeBattleFlashes(store, NOW + 1)).toEqual([]);
  });
});

describe("lost-tile flashes", () => {
  it("flash each lost tile for a bounded time", () => {
    const store = createBattleWarningStore();
    recordOwnTileLosses(store, stateFor(), [{ x: 4, y: 5, newOwnerId: "rival" }], NOW);
    expect(activeBattleFlashes(store, NOW + 100).map((flash) => `${flash.x},${flash.y}`)).toEqual(["4,5"]);
    expect(battleFlashIntensity(activeBattleFlashes(store, NOW)[0]!, NOW)).toBeCloseTo(1);
    expect(activeBattleFlashes(store, NOW + BATTLE_FLASH_MS)).toEqual([]);
    expect(store.flashes.size).toBe(0);
  });

  it("caps the flash map, dropping the oldest", () => {
    const store = createBattleWarningStore();
    const losses = Array.from({ length: BATTLE_FLASH_CAP + 5 }, (_, i) => ({ x: i, y: 0, newOwnerId: "rival" }));
    recordOwnTileLosses(store, stateFor(), losses, NOW);
    const live = activeBattleFlashes(store, NOW);
    expect(live).toHaveLength(BATTLE_FLASH_CAP);
    expect(live[0]?.x).toBe(5);
  });
});
