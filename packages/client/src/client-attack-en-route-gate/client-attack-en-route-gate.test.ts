import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { TileActionDef } from "../client-types.js";
import { ATTACK_EN_ROUTE_LABEL, ATTACK_EN_ROUTE_REASON, gateAttackEnRouteActions, hasOwnAttackEnRoute } from "./client-attack-en-route-gate.js";

const NOW = 1_000_000;
const launch: TileActionDef = { id: "launch_attack", label: "Launch Attack", disabled: false, cost: "12 m.p." };
const region: TileActionDef = { id: "attack_connected_region", label: "Attack Connected Region (3)", disabled: false };

describe("gateAttackEnRouteActions", () => {
  it("leaves Launch Attack alone with no own attack on the tile", () => {
    const actions = [launch, region];
    expect(gateAttackEnRouteActions(actions, createInitialState(), { x: 5, y: 5 }, NOW)).toBe(actions);
  });

  it("greys out Launch Attack as Attack En Route while the player's own attack on the tile is in flight", () => {
    const state = createInitialState();
    state.capture = { startAt: NOW - 1000, resolvesAt: NOW + 3000, target: { x: 5, y: 5 }, actionType: "ATTACK" };
    const out = gateAttackEnRouteActions([launch, region], state, { x: 5, y: 5 }, NOW);
    expect(out[0]).toEqual({ id: "launch_attack", label: ATTACK_EN_ROUTE_LABEL, disabled: true, disabledReason: ATTACK_EN_ROUTE_REASON });
    expect(out[1]).toBe(region);
    // A different tile, or the same one after the fight resolves, is not gated.
    expect(gateAttackEnRouteActions([launch], state, { x: 6, y: 5 }, NOW)[0]).toBe(launch);
    expect(gateAttackEnRouteActions([launch], state, { x: 5, y: 5 }, NOW + 3000)[0]).toBe(launch);
  });

  it("keeps a row already disabled for another reason", () => {
    const state = createInitialState();
    state.capture = { startAt: NOW, resolvesAt: NOW + 3000, target: { x: 5, y: 5 }, actionType: "ATTACK" };
    const shielded: TileActionDef = { ...launch, disabled: true, disabledReason: "Empire is under spawn protection" };
    expect(gateAttackEnRouteActions([shielded], state, { x: 5, y: 5 }, NOW)[0]).toBe(shielded);
  });
});

describe("hasOwnAttackEnRoute", () => {
  it("sees an attack that is sent but not yet accepted", () => {
    const state = createInitialState();
    state.actionInFlight = true;
    state.actionTargetKey = "5,5";
    state.actionCurrent = { x: 5, y: 5, retries: 0, actionType: "ATTACK" };
    expect(hasOwnAttackEnRoute(state, 5, 5, NOW)).toBe(true);
    state.actionCurrent.actionType = "EXPAND";
    expect(hasOwnAttackEnRoute(state, 5, 5, NOW)).toBe(false);
  });

  it("sees muster-funded attacks marching, parked, auto-firing or detached", () => {
    const transit = createInitialState();
    transit.musterTransitByCommand.set("c1", { musterX: 1, musterY: 1, marchToX: 4, marchToY: 5, targetX: 5, targetY: 5, transitStartAt: NOW, transitEndsAt: NOW + 5000, manpower: 10 });
    expect(hasOwnAttackEnRoute(transit, 5, 5, NOW)).toBe(true);

    const deferred = createInitialState();
    deferred.deferredAttackByCommand.set("c2", { fromX: 4, fromY: 5, toX: 5, toY: 5, commandId: "c2", clientSeq: 1 });
    expect(hasOwnAttackEnRoute(deferred, 5, 5, NOW)).toBe(true);

    const muster = createInitialState();
    muster.outgoingMusterAttacksByTile.set("5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: NOW + 2000 });
    expect(hasOwnAttackEnRoute(muster, 5, 5, NOW)).toBe(true);
    muster.outgoingMusterAttacksByTile.set("5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: NOW + 2000, isExpand: true });
    expect(hasOwnAttackEnRoute(muster, 5, 5, NOW)).toBe(false);

    const detached = createInitialState();
    detached.detachedAttacksByCommandId.set("c3", { targetX: 5, targetY: 5, startAt: NOW - 1000, resolvesAt: NOW + 1000 });
    expect(hasOwnAttackEnRoute(detached, 5, 5, NOW)).toBe(true);
    expect(hasOwnAttackEnRoute(detached, 5, 5, NOW + 1000)).toBe(false);
  });
});
