import { afterEach, describe, expect, it, vi } from "vitest";
import { COMBAT_LOCK_ORIGIN_UNDER_ATTACK_MESSAGE, COMBAT_LOCK_TARGET_MESSAGE } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import { createClientOriginSelection } from "../client-origin-selection/client-origin-selection.js";
import { buildMusterActions } from "../client-muster-tile-actions.js";
import type { Tile } from "../client-types.js";
import { explainCombatLockRejection, formatSiegeRemaining, ownTileSiegeAt } from "./client-muster-siege.js";

// Regression for staging 2026-10-19: a player's queued attack fired from their
// own muster flag while ai-13 was attacking that flag's tile, and came back as
// "Action blocked: the tile is already in combat." -- which read as if the
// clicked enemy tile was the problem.

const NOW = 1_000_000;
const wrap = (x: number, y: number) => ({ x, y });

const stateWithBesiegedFlag = () => {
  const state = createInitialState();
  state.me = "me";
  const flag: Tile = { x: 212, y: 185, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", muster: { ownerId: "me", amount: 134, mode: "HOLD", updatedAt: 0 } };
  state.tiles.set("212,185", flag);
  state.tiles.set("211,186", { x: 211, y: 186, terrain: "LAND", ownerId: "ai-13", ownershipState: "SETTLED" });
  state.incomingAttacksByTile.set("212,185", { attackerName: "Ai-13", resolvesAt: NOW + 12_000, attackerId: "ai-13" });
  return { state, flag };
};

describe("ownTileSiegeAt", () => {
  it("reports an unresolved enemy attack on one of our tiles", () => {
    const { state } = stateWithBesiegedFlag();
    expect(ownTileSiegeAt(state, 212, 185, NOW)).toEqual({ x: 212, y: 185, attackerName: "Ai-13", resolvesAt: NOW + 12_000 });
  });

  it("ignores a resolved attack and tiles we no longer own", () => {
    const { state } = stateWithBesiegedFlag();
    expect(ownTileSiegeAt(state, 212, 185, NOW + 12_000)).toBeUndefined();
    state.tiles.set("212,185", { x: 212, y: 185, terrain: "LAND", ownerId: "ai-13" });
    expect(ownTileSiegeAt(state, 212, 185, NOW)).toBeUndefined();
  });

  it("formats the countdown in seconds, then minutes", () => {
    expect(formatSiegeRemaining(11_200)).toBe("12s");
    expect(formatSiegeRemaining(65_000)).toBe("1m 05s");
  });
});

describe("explainCombatLockRejection", () => {
  it("names the besieged muster and its countdown when our launch tile is under attack", () => {
    const { state } = stateWithBesiegedFlag();
    const text = explainCombatLockRejection(
      state,
      { code: "LOCKED", message: COMBAT_LOCK_ORIGIN_UNDER_ATTACK_MESSAGE, targetX: 211, targetY: 186, nowMs: NOW },
      wrap
    );
    expect(text).toBe("Your muster at (212, 185) is under siege by Ai-13 — free in 12s.");
  });

  it("says another battle holds the target when the target itself is locked", () => {
    const { state } = stateWithBesiegedFlag();
    const text = explainCombatLockRejection(
      state,
      { code: "LOCKED", message: COMBAT_LOCK_TARGET_MESSAGE, targetX: 211, targetY: 186, nowMs: NOW },
      wrap
    );
    expect(text).toBe("Another battle is already being fought for this tile. Try again once it ends.");
  });

  it("leaves unrelated errors to the normal explanation", () => {
    const { state } = stateWithBesiegedFlag();
    expect(explainCombatLockRejection(state, { code: "NOT_ADJACENT", message: "x", nowMs: NOW }, wrap)).toBeUndefined();
  });
});

describe("muster flag menu under siege", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("greys out Advance, March and Clear with the siege reason, but keeps Expand Capacity", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
    const { state, flag } = stateWithBesiegedFlag();
    const actions = buildMusterActions(flag, state, NOW);
    const byId = new Map(actions.map((action) => [action.id, action]));
    for (const id of ["muster_advance", "muster_march", "muster_clear"] as const) {
      expect(byId.get(id)).toMatchObject({ disabled: true, disabledReason: "Under siege by Ai-13 — free in 12s" });
    }
    expect(byId.get("muster_expand_cap")?.disabledReason).not.toContain("siege");
  });

  it("re-enables them once the attack has resolved", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
    const { state, flag } = stateWithBesiegedFlag();
    const actions = buildMusterActions(flag, state, NOW + 12_000);
    expect(actions.find((action) => action.id === "muster_clear")?.disabled).toBe(false);
  });
});

describe("launch tile selection under siege", () => {
  it("launches from a free neighbour instead of one an enemy is attacking", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { state } = stateWithBesiegedFlag();
    state.tiles.set("212,186", { x: 212, y: 186, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });
    state.incomingAttacksByTile.set("212,186", { attackerName: "Ai-13", resolvesAt: NOW + 20_000 });
    state.tiles.set("211,187", { x: 211, y: 187, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });
    const selector = createClientOriginSelection({ state, keyFor: (x, y) => `${x},${y}`, wrapX: (x) => x, wrapY: (y) => y });
    expect(selector.pickOriginForTarget(211, 186)).toMatchObject({ x: 211, y: 187 });
    vi.useRealTimers();
  });

  it("still returns a besieged neighbour when it is the only one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { state } = stateWithBesiegedFlag();
    const selector = createClientOriginSelection({ state, keyFor: (x, y) => `${x},${y}`, wrapX: (x) => x, wrapY: (y) => y });
    expect(selector.pickOriginForTarget(211, 186)).toMatchObject({ x: 212, y: 185 });
    vi.useRealTimers();
  });
});
