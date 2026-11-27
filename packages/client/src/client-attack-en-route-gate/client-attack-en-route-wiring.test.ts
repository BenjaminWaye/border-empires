// @vitest-environment happy-dom
// The Attack En Route gate reaches every way Launch Attack is offered or
// fired, not just the pure helper (client-attack-en-route-gate.test.ts).
import { describe, expect, it, vi } from "vitest";
import { createInitialState, type ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";
import { finishSingleTileActions } from "../client-tile-action-logic/client-single-tile-action-extras.js";
import { launchAttacksWithEffort, type AttackLaunchDeps } from "../client-launch-attack-effort/client-launch-attack-effort.js";
import { selectBarButtons } from "../client-hud-v2/client-hud-v2-action-bar.js";
import { injectMarchAttackActions } from "../client-march-attack-actions/client-march-attack-actions.js";
import { confirmTapAction } from "../client-tile-interaction/client-tile-interaction.js";
import { ATTACK_EN_ROUTE_LABEL, ATTACK_EN_ROUTE_REASON, attackEnRouteRow } from "./client-attack-en-route-gate.js";

const enemy = (x: number, y: number): Tile => ({ x, y, terrain: "LAND", ownerId: "rival", ownershipState: "FRONTIER" });

const stateAttacking = (x: number, y: number): ClientState => {
  const state = createInitialState();
  state.me = "me";
  state.tiles.set("0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "me" });
  state.capture = { startAt: Date.now() - 1000, resolvesAt: Date.now() + 60_000, target: { x, y }, actionType: "ATTACK" };
  return state;
};

const view = (actions: TileActionDef[]): TileMenuView =>
  ({ title: "Enemy", subtitle: "", tabs: ["actions"], overviewLines: [], actions, buildings: [], crystal: [] }) as TileMenuView;

describe("Attack En Route wiring", () => {
  it("the single-tile action list (tile sheet and confirming second tap) greys Launch Attack", () => {
    const state = stateAttacking(1, 0);
    const actions = finishSingleTileActions([{ id: "launch_attack", label: "Launch Attack", disabled: false }], state, enemy(1, 0));
    expect(actions[0]).toMatchObject({ label: ATTACK_EN_ROUTE_LABEL, disabled: true, disabledReason: ATTACK_EN_ROUTE_REASON });
    expect(confirmTapAction(actions)).toBeUndefined();
  });

  it("counts an attack parked on a muster flag that is still filling", () => {
    const state = stateAttacking(9, 9);
    state.pendingMusterAttacks.push({ targetX: 1, targetY: 0, fromX: 0, fromY: 0, musterTileKey: "0,0" } as ClientState["pendingMusterAttacks"][number]);
    const actions = finishSingleTileActions([{ id: "launch_attack", label: "Launch Attack", disabled: false }], state, enemy(1, 0));
    expect(actions[0]?.disabled).toBe(true);
  });

  it("keeps the greyed row as the HUD v2 bar's main button instead of dropping it to the minor row", () => {
    const bar = selectBarButtons(view([attackEnRouteRow(), { id: "attack_connected_region", label: "Attack Connected Region (3)", disabled: false }]));
    expect(bar[0]).toMatchObject({ kind: "action", primary: true, action: { label: ATTACK_EN_ROUTE_LABEL } });
  });

  it("a connected-region launch skips the tile already under attack", () => {
    const state = stateAttacking(1, 0);
    for (const t of [enemy(1, 0), enemy(2, 0), enemy(3, 0)]) state.tiles.set(`${t.x},${t.y}`, t);
    const queueSpecificTargets = vi.fn((keys: string[]) => ({ queued: keys.length, skipped: 0, queuedKeys: keys }));
    const deps: AttackLaunchDeps = {
      keyFor: (x, y) => `${x},${y}`,
      pickOriginForTarget: () => state.tiles.get("0,0"),
      isTileOwnedByAlly: () => false,
      queueSpecificTargets,
      processActionQueue: vi.fn(() => true),
      attackQueueFailureReason: () => "nope",
      pushFeed: vi.fn(),
      showCaptureAlert: vi.fn(),
      hideTileActionMenu: vi.fn()
    };
    launchAttacksWithEffort(state, { targetKeys: ["1,0", "2,0", "3,0"], scope: "region", selected: state.tiles.get("1,0") }, deps);
    expect(queueSpecificTargets).toHaveBeenCalledWith(["2,0", "3,0"]);
  });

  it("a deep enemy tile under an own march gets Attack En Route instead of March Attack rows", () => {
    const state = stateAttacking(20, 0);
    state.allies = [];
    const target = enemy(20, 0);
    state.tiles.set("20,0", target);
    const v = view([{ id: "launch_attack", label: "Launch Attack", disabled: true, disabledReason: "No bordering origin tile or linked dock" }]);
    injectMarchAttackActions(v, target, state);
    expect(v.actions.map((a) => a.label)).toEqual([ATTACK_EN_ROUTE_LABEL]);
  });
});
