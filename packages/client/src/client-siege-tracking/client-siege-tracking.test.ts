import { describe, expect, it } from "vitest";

import {
  EXPIRED_SIEGE_GRACE_MS,
  buildCaptureState,
  clearResolvedIncomingAttack,
  drawableIncomingAttack,
  handleMusterAdvanceCombatStart,
  pruneExpiredIncomingAttacks,
  pruneExpiredOutgoingMusterAttacks,
  resolveCombatResultPayload
} from "./client-siege-tracking.js";
import { applyGatewayTileDeltaBatch } from "../client-gateway-sync/client-gateway-sync.js";
import type { Tile } from "../client-types.js";

const siegeState = (resolvesAt = Date.now() + 30_000) => ({
  incomingAttacksByTile: new Map([["4,7", { attackerName: "Rival", resolvesAt, attackerId: "rival-1", fromX: 3, fromY: 7 }]])
});

describe("clearResolvedIncomingAttack", () => {
  // The bug this guards: a besieged tile keeps receiving ordinary periodic
  // deltas (yield refresh, population growth, muster/maintenance ticks) for the
  // whole ~30s countdown. Deleting on those wiped the siege seconds after
  // ATTACK_ALERT registered it, so the pre-resolution battle dots and the red
  // under-attack cross were never visible for more than an instant.
  it("keeps the siege when an unrelated periodic delta touches the tile", () => {
    const state = siegeState();
    clearResolvedIncomingAttack(state, "4,7", { }, { ownerId: "me", ownershipState: "SETTLED" });
    expect(state.incomingAttacksByTile.has("4,7")).toBe(true);
  });

  it("keeps the siege when a full tile delta merely restates the current owner", () => {
    const state = siegeState();
    clearResolvedIncomingAttack(
      state,
      "4,7",
      { ownerId: "me", ownershipState: "SETTLED" },
      { ownerId: "me", ownershipState: "SETTLED" }
    );
    expect(state.incomingAttacksByTile.has("4,7")).toBe(true);
  });

  it("ends the siege when the server's combat broadcast rides the delta", () => {
    const state = siegeState();
    // Attacker-lost shape: combat-only delta, no ownership fields at all.
    clearResolvedIncomingAttack(state, "4,7", { combatJson: "{}" }, { ownerId: "me", ownershipState: "SETTLED" });
    expect(state.incomingAttacksByTile.has("4,7")).toBe(false);
  });

  it("ends the siege when the tile actually changes hands", () => {
    const state = siegeState();
    clearResolvedIncomingAttack(
      state,
      "4,7",
      { ownerId: "rival-1", ownershipState: "FRONTIER" },
      { ownerId: "me", ownershipState: "SETTLED" }
    );
    expect(state.incomingAttacksByTile.has("4,7")).toBe(false);
  });

  it("ends the siege when the tile is cleared to unowned", () => {
    const state = siegeState();
    clearResolvedIncomingAttack(state, "4,7", { ownerId: null }, { ownerId: "me", ownershipState: "SETTLED" });
    expect(state.incomingAttacksByTile.has("4,7")).toBe(false);
  });
});

describe("pruneExpiredIncomingAttacks", () => {
  it("keeps a siege that is still counting down", () => {
    const resolvesAt = 1_000_000;
    const state = siegeState(resolvesAt);
    pruneExpiredIncomingAttacks(state, resolvesAt - 5_000);
    expect(state.incomingAttacksByTile.size).toBe(1);
  });

  it("keeps a just-resolved siege through the grace window so the clash can hand over", () => {
    const resolvesAt = 1_000_000;
    const state = siegeState(resolvesAt);
    pruneExpiredIncomingAttacks(state, resolvesAt + EXPIRED_SIEGE_GRACE_MS - 1);
    expect(state.incomingAttacksByTile.size).toBe(1);
  });

  it("drops a siege whose resolution broadcast never arrived", () => {
    const resolvesAt = 1_000_000;
    const state = siegeState(resolvesAt);
    pruneExpiredIncomingAttacks(state, resolvesAt + EXPIRED_SIEGE_GRACE_MS);
    expect(state.incomingAttacksByTile.size).toBe(0);
  });
});

describe("drawableIncomingAttack", () => {
  const resolvesAt = 1_000_000;

  it("returns the siege while it is still counting down", () => {
    const state = siegeState(resolvesAt);
    expect(drawableIncomingAttack(state, "4,7", resolvesAt - 5_000)?.attackerId).toBe("rival-1");
  });

  it("stops drawing at resolvesAt but keeps the entry through the grace window", () => {
    // The entry has to outlive resolvesAt: the resolution broadcast lands
    // slightly late, and registerActiveBattleFromTileDelta reads this map to
    // decide whether to continue the clash or restart the approach.
    const state = siegeState(resolvesAt);
    expect(drawableIncomingAttack(state, "4,7", resolvesAt + 1)).toBeUndefined();
    expect(state.incomingAttacksByTile.has("4,7")).toBe(true);
  });

  it("evicts the entry once past the grace window", () => {
    const state = siegeState(resolvesAt);
    expect(drawableIncomingAttack(state, "4,7", resolvesAt + EXPIRED_SIEGE_GRACE_MS)).toBeUndefined();
    expect(state.incomingAttacksByTile.has("4,7")).toBe(false);
  });

  it("returns undefined for a tile with no siege", () => {
    expect(drawableIncomingAttack(siegeState(), "0,0", Date.now())).toBeUndefined();
  });
});

describe("gateway tile-delta path", () => {
  const createDeps = () => {
    const besiegedTile: Tile = { x: 4, y: 7, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", fogged: false };
    return {
      state: {
        me: "me",
        tiles: new Map<string, Tile>([["4,7", besiegedTile]]),
        tilesRevision: 0,
        tilesRevisionChangedKeys: new Set<string>(),
        tilesRevisionOverflowed: false,
        ...siegeState(),
        discoveredTiles: new Set<string>(["4,7"]),
        upkeepLastTick: { foodCoverage: 1 },
        mods: { income: 1 }
      },
      keyFor: (x: number, y: number) => `${x},${y}`,
      mergeIncomingTileDetail: (_existing: Tile | undefined, incoming: Tile) => incoming,
      mergeServerTileWithOptimisticState: (tile: Tile) => tile
    };
  };

  // The reported symptom: battle dots only appeared for the last ~2s of an
  // attack. A besieged tile receives routine yield/population/muster deltas
  // throughout its ~30s countdown, and every one of them used to evict the
  // siege that drives the pre-resolution dots.
  it("keeps the siege across a routine yield refresh on the besieged tile", () => {
    const deps = createDeps();
    applyGatewayTileDeltaBatch(deps as never, [{ x: 4, y: 7, yield: 3 } as never]);
    expect(deps.state.incomingAttacksByTile.has("4,7")).toBe(true);
  });

  it("keeps the siege when the delta restates unchanged ownership", () => {
    const deps = createDeps();
    applyGatewayTileDeltaBatch(deps as never, [{ x: 4, y: 7, ownerId: "me", ownershipState: "SETTLED" } as never]);
    expect(deps.state.incomingAttacksByTile.has("4,7")).toBe(true);
  });

  it("ends the siege on the combat-resolution delta", () => {
    const deps = createDeps();
    applyGatewayTileDeltaBatch(deps as never, [{ x: 4, y: 7, combatJson: "{}" } as never]);
    expect(deps.state.incomingAttacksByTile.has("4,7")).toBe(false);
  });

  it("ends the siege when the tile is captured", () => {
    const deps = createDeps();
    applyGatewayTileDeltaBatch(deps as never, [{ x: 4, y: 7, ownerId: "rival-1", ownershipState: "FRONTIER" } as never]);
    expect(deps.state.incomingAttacksByTile.has("4,7")).toBe(false);
  });
});

describe("buildCaptureState", () => {
  const base = { startAt: 10, resolvesAt: 99, target: { x: 2, y: 3 } };

  it("carries origin and actionType so the attacker can render their own siege", () => {
    expect(buildCaptureState({ ...base, origin: { x: 1, y: 3 }, actionType: "ATTACK" })).toEqual({
      startAt: 10,
      resolvesAt: 99,
      target: { x: 2, y: 3 },
      origin: { x: 1, y: 3 },
      actionType: "ATTACK"
    });
  });

  it("omits a malformed or missing origin rather than emitting NaN coordinates", () => {
    expect(buildCaptureState({ ...base, actionType: "ATTACK" }).origin).toBeUndefined();
    expect(buildCaptureState({ ...base, origin: { x: "nope" }, actionType: "ATTACK" }).origin).toBeUndefined();
  });

  it("ignores an unrecognised actionType", () => {
    expect(buildCaptureState({ ...base, actionType: "SETTLE" }).actionType).toBeUndefined();
  });

  it("preserves the silent and muster-advance flags", () => {
    const capture = buildCaptureState({ ...base, actionType: "EXPAND", silent: true, fromMusterAdvance: true });
    expect(capture).toEqual(expect.objectContaining({ actionType: "EXPAND", silent: true, fromMusterAdvance: true }));
  });

  it("omits the silent and muster-advance flags when unset", () => {
    const capture = buildCaptureState({ ...base, actionType: "ATTACK" });
    expect("silent" in capture).toBe(false);
    expect("fromMusterAdvance" in capture).toBe(false);
  });
});

const keyFor = (x: number, y: number) => `${x},${y}`;

// Regression coverage for the muster flag advance-attack animation bug
// report: the skirmish never played (only the final capture flourish) and
// the tile briefly flipped back to the defender before settling.
describe("handleMusterAdvanceCombatStart", () => {
  it("ignores a manually-dispatched COMBAT_START", () => {
    const state = { outgoingMusterAttacksByTile: new Map() };
    const applyCombatOutcomeMessage = () => {};
    expect(
      handleMusterAdvanceCombatStart(
        state,
        keyFor,
        { type: "COMBAT_START", commandId: "some-uuid", target: { x: 1, y: 1 }, origin: { x: 0, y: 1 }, resolvesAt: 1_000 },
        applyCombatOutcomeMessage
      )
    ).toBe(false);
    expect(state.outgoingMusterAttacksByTile.size).toBe(0);
  });

  it("tracks a muster-advance auto-fire attack so the attacker-side skirmish can render", () => {
    const state = { outgoingMusterAttacksByTile: new Map() };
    const applyCombatOutcomeMessage = () => {};
    const handled = handleMusterAdvanceCombatStart(
      state,
      keyFor,
      {
        type: "COMBAT_START",
        commandId: "territory-auto:muster-advance:5,5",
        target: { x: 9, y: 4 },
        origin: { x: 8, y: 4 },
        resolvesAt: 2_000
      },
      applyCombatOutcomeMessage
    );
    expect(handled).toBe(true);
    expect(state.outgoingMusterAttacksByTile.get("9,4")).toEqual({
      originX: 8, originY: 4, targetX: 9, targetY: 4, resolvesAt: 2_000
    });
  });

  it("still forwards an already-locked result to applyCombatOutcomeMessage", () => {
    const state = { outgoingMusterAttacksByTile: new Map() };
    const applied: unknown[] = [];
    handleMusterAdvanceCombatStart(
      state,
      keyFor,
      {
        type: "COMBAT_START",
        commandId: "territory-auto:muster-advance:5,5",
        target: { x: 9, y: 4 },
        origin: { x: 8, y: 4 },
        resolvesAt: 2_000,
        result: { attackerWon: true }
      },
      (result) => applied.push(result)
    );
    expect(applied).toEqual([{ attackerWon: true }]);
  });
});

describe("pruneExpiredOutgoingMusterAttacks", () => {
  it("drops an outgoing muster attack whose resolution broadcast never arrived", () => {
    const resolvesAt = 1_000_000;
    const state = { outgoingMusterAttacksByTile: new Map([["9,4", { originX: 8, originY: 4, targetX: 9, targetY: 4, resolvesAt }]]) };
    pruneExpiredOutgoingMusterAttacks(state, resolvesAt + EXPIRED_SIEGE_GRACE_MS);
    expect(state.outgoingMusterAttacksByTile.size).toBe(0);
  });

  it("keeps one still counting down", () => {
    const resolvesAt = 1_000_000;
    const state = { outgoingMusterAttacksByTile: new Map([["9,4", { originX: 8, originY: 4, targetX: 9, targetY: 4, resolvesAt }]]) };
    pruneExpiredOutgoingMusterAttacks(state, resolvesAt - 1);
    expect(state.outgoingMusterAttacksByTile.size).toBe(1);
  });
});

describe("resolveCombatResultPayload", () => {
  // The flip-flop bug: a "commit-only" COMBAT_RESULT (no manpowerDelta/
  // pillagedGold/etc — the common shape for a plain frontier capture) used
  // to unconditionally reuse pendingCombatReveal.result with no check that
  // it belonged to the tile actually resolving.
  it("ignores a locked prediction for a different target", () => {
    const state = {
      pendingCombatReveal: { targetKey: "1,1", title: "", detail: "", tone: "success" as const, revealed: false, result: { target: { x: 1, y: 1 }, changes: [{ x: 1, y: 1, ownerId: "rival" }] } }
    };
    const msg = { target: { x: 9, y: 4 }, changes: [{ x: 9, y: 4, ownerId: "me" }] };
    expect(resolveCombatResultPayload(state, keyFor, msg, true)).toBe(msg);
  });

  it("uses the locked prediction when it matches the resolving target", () => {
    const locked = { target: { x: 9, y: 4 }, changes: [{ x: 9, y: 4, ownerId: "me" }] };
    const state = {
      pendingCombatReveal: { targetKey: "9,4", title: "", detail: "", tone: "success" as const, revealed: false, result: locked }
    };
    const msg = { target: { x: 9, y: 4 } };
    expect(resolveCombatResultPayload(state, keyFor, msg, true)).toBe(locked);
  });

  it("never substitutes the locked prediction when the message carries real combat fields", () => {
    const state = {
      pendingCombatReveal: { targetKey: "9,4", title: "", detail: "", tone: "success" as const, revealed: false, result: { target: { x: 9, y: 4 }, changes: [] } }
    };
    const msg = { target: { x: 9, y: 4 }, manpowerDelta: -5 };
    expect(resolveCombatResultPayload(state, keyFor, msg, false)).toBe(msg);
  });
});
