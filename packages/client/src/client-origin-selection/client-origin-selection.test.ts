import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { createClientOriginSelection } from "./client-origin-selection.js";
import type { Tile } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const wrap = (value: number, size: number): number => ((value % size) + size) % size;

const createSelector = () => {
  const state = createInitialState();
  state.me = "me";
  return {
    state,
    selector: createClientOriginSelection({
      state,
      keyFor,
      wrapX: (x) => wrap(x, 450),
      wrapY: (y) => wrap(y, 450)
    })
  };
};

const addTile = (state: ReturnType<typeof createInitialState>, tile: Tile): void => {
  state.tiles.set(keyFor(tile.x, tile.y), tile);
};

describe("createClientOriginSelection", () => {
  it("prefers the adjacent origin with the strongest attack multiplier", () => {
    const { state, selector } = createSelector();
    addTile(state, { x: 10, y: 10, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" });
    addTile(state, { x: 10, y: 9, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });
    addTile(state, {
      x: 11,
      y: 10,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      siegeOutpost: { ownerId: "me", status: "active" }
    });

    expect(selector.pickOriginForTarget(10, 10)).toMatchObject({ x: 11, y: 10 });
  });

  it("applies owned outpost attack bonuses when ranking siege outposts", () => {
    const { state, selector } = createSelector();
    state.techIds = ["outpost-doctrine"];
    state.techCatalog = [
      {
        id: "outpost-doctrine",
        name: "Outpost Doctrine",
        tier: 1,
        description: "",
        mods: {},
        effects: { outpostAttackMult: 1.2 },
        requirements: { gold: 0, resources: {} }
      }
    ];
    addTile(state, { x: 20, y: 20, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" });
    addTile(state, {
      x: 20,
      y: 19,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" }
    });
    addTile(state, {
      x: 21,
      y: 20,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      siegeOutpost: { ownerId: "me", status: "active" }
    });

    expect(selector.pickOriginForTarget(20, 20)).toMatchObject({ x: 21, y: 20 });
  });

  it("picks a bridge origin when target is a bridged tile", () => {
    const { state, selector } = createSelector();
    addTile(state, { x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });
    addTile(state, { x: 0, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" });
    addTile(state, { x: 0, y: 8, terrain: "LAND" });
    state.activeAetherBridges = [
      {
        bridgeId: "br-1",
        ownerId: "me",
        from: { x: 0, y: 0 },
        to: { x: 0, y: 8 },
        startedAt: Date.now(),
        endsAt: Date.now() + 1_000_000
      }
    ];

    expect(selector.pickOriginForTarget(0, 8)).toMatchObject({ x: 0, y: 0 });
  });

  it("returns undefined for bridged target after bridge expires", () => {
    const { state, selector } = createSelector();
    addTile(state, { x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });
    addTile(state, { x: 0, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" });
    addTile(state, { x: 0, y: 8, terrain: "LAND" });
    state.activeAetherBridges = [
      {
        bridgeId: "br-1",
        ownerId: "me",
        from: { x: 0, y: 0 },
        to: { x: 0, y: 8 },
        startedAt: Date.now() - 2_000,
        endsAt: Date.now() - 1 // already expired
      }
    ];

    expect(selector.pickOriginForTarget(0, 8)).toBeUndefined();
  });

  it("ignores bridges owned by another player", () => {
    const { state, selector } = createSelector();
    addTile(state, { x: 0, y: 0, terrain: "LAND", ownerId: "other", ownershipState: "SETTLED" });
    addTile(state, { x: 0, y: 8, terrain: "LAND" });
    state.activeAetherBridges = [
      {
        bridgeId: "br-1",
        ownerId: "other",
        from: { x: 0, y: 0 },
        to: { x: 0, y: 8 },
        startedAt: Date.now(),
        endsAt: Date.now() + 1_000_000
      }
    ];

    expect(selector.pickOriginForTarget(0, 8)).toBeUndefined();
  });

  it("skips cut-off frontier origin in favor of a healthy adjacent tile", () => {
    const { state, selector } = createSelector();
    const now = Date.now();
    addTile(state, { x: 10, y: 10, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" });
    // Cut-off encircled frontier tile adjacent to target.
    addTile(state, { x: 10, y: 9, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", frontierDecayAt: now + 30_000, frontierDecayKind: "ENCIRCLEMENT" });
    // Healthy owned tile also adjacent to target.
    addTile(state, { x: 11, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });

    // Should pick the healthy tile, not the cut-off one.
    expect(selector.pickOriginForTarget(10, 10)).toMatchObject({ x: 11, y: 10 });
  });

  it("returns undefined when the only adjacent origin is cut off", () => {
    const { state, selector } = createSelector();
    const now = Date.now();
    addTile(state, { x: 10, y: 10, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" });
    // Only adjacent owned tile is cut off.
    addTile(state, { x: 10, y: 9, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", frontierDecayAt: now + 30_000, frontierDecayKind: "ENCIRCLEMENT" });

    expect(selector.pickOriginForTarget(10, 10)).toBeUndefined();
  });

  it("chains off a neutral neighbor that is only queued locally (not yet dispatched)", () => {
    const { state, selector } = createSelector();
    // B: neutral, adjacent to owned A, and sitting in the local action queue.
    addTile(state, { x: 10, y: 10, terrain: "LAND" });
    addTile(state, { x: 10, y: 9, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });
    state.actionQueue.push({ x: 10, y: 10, retries: 0 });
    // C: neutral, adjacent only to B (not to any owned tile).
    addTile(state, { x: 11, y: 11, terrain: "LAND" });

    expect(selector.pickOriginForTarget(11, 11)).toMatchObject({ x: 10, y: 10 });
    // Strict origin selection (real dispatch) must not treat a merely-queued
    // neutral tile as usable — it isn't owned yet.
    expect(selector.pickOriginForTarget(11, 11, true, false)).toBeUndefined();
  });

  it("chains off a neutral neighbor that is the in-flight EXPAND target", () => {
    const { state, selector } = createSelector();
    addTile(state, { x: 10, y: 10, terrain: "LAND" });
    addTile(state, { x: 10, y: 9, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });
    state.actionInFlight = true;
    state.actionCurrent = { x: 10, y: 10, retries: 0, actionType: "EXPAND" };
    addTile(state, { x: 11, y: 11, terrain: "LAND" });

    expect(selector.pickOriginForTarget(11, 11)).toMatchObject({ x: 10, y: 10 });
  });

  it("does not chain through an enemy-owned neighbor that merely has a queued ATTACK", () => {
    // actionQueue entries carry no actionType, so a queued attack on enemy
    // territory must not be mistaken for a pending EXPAND claim -- B here is
    // enemy-owned, not neutral land being claimed.
    const { state, selector } = createSelector();
    addTile(state, { x: 10, y: 10, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" }); // B
    addTile(state, { x: 10, y: 9, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }); // A, owned, adjacent to B
    state.actionQueue.push({ x: 10, y: 10, retries: 0 }); // queued ATTACK on B
    addTile(state, { x: 11, y: 11, terrain: "LAND" }); // C, neutral, adjacent only to B

    expect(selector.pickOriginForTarget(11, 11)).toBeUndefined();
  });

  // Regression: a plain adjacent-tile expand click (client-adjacent-expand-
  // claim.ts) enqueues straight into state.waypoint, not state.actionQueue
  // -- it's only promoted into actionQueue/actionCurrent lazily, the next
  // time processActionQueue's topUpFromWaypoint runs (skipped entirely
  // while another action is still in flight). Before this fix, a tile
  // queued behind an in-flight claim was invisible to hasPendingExpandClaim
  // until that promotion happened, so the very next click adjacent to it
  // fell through to opening the tile menu instead of chaining -- exactly
  // the flow this function exists to support ("chains off a neutral
  // neighbor that is only queued locally" above, but via state.waypoint).
  it("chains off a neutral neighbor that is only queued via state.waypoint (not yet promoted to actionQueue)", () => {
    const { state, selector } = createSelector();
    // B: neutral, adjacent to owned A, queued only in state.waypoint --
    // simulating a click on B while some other action is still in flight,
    // so topUpFromWaypoint hasn't had a chance to promote it yet.
    addTile(state, { x: 10, y: 10, terrain: "LAND" });
    addTile(state, { x: 10, y: 9, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });
    state.waypoint.push({ target: { x: 10, y: 10 } } as never);
    // C: neutral, adjacent only to B (not to any owned tile).
    addTile(state, { x: 11, y: 11, terrain: "LAND" });

    expect(selector.pickOriginForTarget(11, 11)).toMatchObject({ x: 10, y: 10 });
    // Strict origin selection (real dispatch) must not treat a merely-queued
    // neutral tile as usable — it isn't owned yet.
    expect(selector.pickOriginForTarget(11, 11, true, false)).toBeUndefined();
  });

  it("does not treat a plain unqueued neutral neighbor as a usable origin", () => {
    const { state, selector } = createSelector();
    addTile(state, { x: 10, y: 10, terrain: "LAND" });
    addTile(state, { x: 11, y: 11, terrain: "LAND" });

    expect(selector.pickOriginForTarget(11, 11)).toBeUndefined();
  });

  it("skips cut-off dock origins", () => {
    const { state, selector } = createSelector();
    const now = Date.now();
    // Target at (20,20) is enemy. No healthy adjacent tile — the only owned
    // tile touching target is a cut-off frontier, so the adjacent picker
    // returns nothing, and pickOriginForTarget falls back to the dock picker.
    addTile(state, { x: 20, y: 20, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" });
    // The only adjacent owned tile is cut off — adjacent picker will skip it.
    addTile(state, { x: 20, y: 19, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", frontierDecayAt: now + 30_000, frontierDecayKind: "ENCIRCLEMENT" });
    // Cut-off dock tile.
    addTile(state, { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", dockId: "dockA", frontierDecayAt: now + 30_000, frontierDecayKind: "ENCIRCLEMENT" });
    // Healthy dock tile linked to another tile adjacent to target.
    addTile(state, { x: 6, y: 6, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", dockId: "dockB" });
    addTile(state, { x: 21, y: 20, terrain: "LAND" }); // neutral tile adjacent to target
    // Link dockB (6,6) to (21,20) — which is adjacent to target (20,20).
    state.dockPairs = [{ ax: 6, ay: 6, bx: 21, by: 20 }];
    // dockA is also linked to the same destination tile but is cut off.
    state.dockPairs.push({ ax: 5, ay: 5, bx: 21, by: 20 });

    // pickOriginForTarget: adjacent cut-off tile skipped → falls back to dock picker.
    // The dock picker must skip the cut-off dockA and return dockB.
    const origin = selector.pickOriginForTarget(20, 20);
    expect(origin).toBeDefined();
    expect(origin!.dockId).toBe("dockB");
  });

  it("picks a dock origin for a dock-to-dock attack (target is the dock destination)", () => {
    const { state, selector } = createSelector();
    // Player dock P on island A, enemy dock E on island B.
    // Dock pair directly connects P → E; the attack target IS the enemy dock tile.
    addTile(state, { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", dockId: "dockP" });
    addTile(state, { x: 20, y: 8, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED", dockId: "dockE" });
    state.dockPairs = [{ ax: 5, ay: 5, bx: 20, by: 8 }];

    const origin = selector.pickOriginForTarget(20, 8);
    expect(origin).toBeDefined();
    expect(origin!.x).toBe(5);
    expect(origin!.y).toBe(5);
  });

  it("picks a dock origin via reverse lookup when target dock routes lead to the player tile", () => {
    const { state, selector } = createSelector();
    // Pair stored with enemy dock as the ax/ay endpoint — reverse direction.
    addTile(state, { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", dockId: "dockP" });
    addTile(state, { x: 20, y: 8, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED", dockId: "dockE" });
    state.dockPairs = [{ ax: 20, ay: 8, bx: 5, by: 5 }];

    const origin = selector.pickOriginForTarget(20, 8);
    expect(origin).toBeDefined();
    expect(origin!.x).toBe(5);
    expect(origin!.y).toBe(5);
  });

  // Regression: clicking a neutral tile that sits next to the *far side* of
  // a settled dock pair (not the dock tile itself) must resolve a frontier
  // origin through the dock, the same as it would through plain border
  // adjacency, so the click can instant-expand instead of falling back to
  // the tile menu. This only works when callers leave allowAdjacentToDock at
  // its default (true) -- client-action-flow.ts previously hard-coded it to
  // false at every click site, which suppressed exactly this case.
  it("picks a dock origin for a neutral tile merely adjacent to the far dock (default allowAdjacentToDock)", () => {
    const { state, selector } = createSelector();
    addTile(state, { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", dockId: "dockP" });
    addTile(state, { x: 20, y: 8, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", dockId: "dockQ" });
    state.dockPairs = [{ ax: 5, ay: 5, bx: 20, by: 8 }];
    // Neutral tile adjacent to dockQ (20,8), not the dock tile itself.
    addTile(state, { x: 21, y: 8, terrain: "LAND" });

    const origin = selector.pickOriginForTarget(21, 8);
    expect(origin).toBeDefined();
    expect(origin!.dockId).toBe("dockQ");
  });
});
