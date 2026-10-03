import { describe, expect, it, vi } from "vitest";
import { syncMusterTransitOverlay } from "./client-map-3d-capture-overlays.js";
import { CLASH_MS } from "./client-map-3d-popup-marine/popup-marine-overlay-fx.js";
import type { Heightfield } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";
import type { MusterTransit, MusterTransitOverlay } from "./client-map-3d-muster-transit-overlay.js";
import type { ClientState } from "./client-state/client-state.js";
import type { ActiveBattleOverlay } from "./client-battle-overlay/client-battle-overlay.js";

// Reactive shield reveal (docs/replenishment-update-plan.md workstream E):
// a resolved battle whose defender was shielded carries the shield tile's
// coordinates, and syncMusterTransitOverlay reuses the existing muster
// march visual (client-map-3d-muster-transit-overlay.ts) to walk that
// flag's company from the shield tile to the fight, arriving quickly as
// the clash begins (it fought this battle, it wasn't late to it), then
// stands at ease until the whole battle overlay expires.
const makeHeightfield = (): Heightfield =>
  ({
    elevationAt: () => 0,
    cornerYAt: () => 0
  }) as unknown as Heightfield;

const makeOverlay = (): MusterTransitOverlay => ({
  clear: vi.fn(),
  addTransit: vi.fn(),
  commit: vi.fn(),
  tick: vi.fn(),
  dispose: vi.fn()
});

const baseBattle: ActiveBattleOverlay = {
  originX: 1,
  originY: 1,
  targetX: 10,
  targetY: 11,
  attackerOwnerId: "attacker",
  defenderOwnerId: "defender",
  attackerWon: true,
  startAt: 1_000,
  clashAt: 2_500,
  endAt: 4_700,
  fromSkirmish: false
};

const makeState = (activeBattles: ClientState["activeBattles"]): ClientState =>
  ({
    camX: 0,
    camY: 0,
    me: "attacker",
    dockPairs: [],
    musterTransitByTile: new Map(),
    outgoingMusterAttacksByTile: new Map(),
    incomingAttacksByTile: new Map(),
    deferredAttackByTile: new Map(),
    activeBattles
  }) as unknown as ClientState;

describe("syncMusterTransitOverlay -- shield reinforcement march", () => {
  it("adds a march from the shield tile to the target tile, in the defender's colour, for a shielded battle", () => {
    const overlay = makeOverlay();
    const state = makeState(new Map([["10,11", { ...baseBattle, shieldX: 10, shieldY: 15 }]]));
    const effectiveOverlayColor = (ownerId: string) => (ownerId === "defender" ? "#defender-color" : "#other-color");

    syncMusterTransitOverlay(state, effectiveOverlayColor, makeHeightfield(), overlay, 0, 0, () => "");

    expect(overlay.addTransit).toHaveBeenCalledTimes(1);
    const transit = (overlay.addTransit as ReturnType<typeof vi.fn>).mock.calls[0]![0] as MusterTransit;
    expect(transit.ownerColor).toBe("#defender-color");
    expect(transit.startAt).toBe(baseBattle.clashAt);
    // Arrives well inside CLASH_MS -- already there once the firefight is
    // under way, not showing up only once the dust settles.
    expect(transit.arriveAt).toBeGreaterThan(baseBattle.clashAt);
    expect(transit.arriveAt).toBeLessThan(baseBattle.clashAt + CLASH_MS);
    // Stands at ease from arrival until the whole battle overlay expires.
    expect(transit.standUntil).toBe(baseBattle.endAt);
    // Path runs from the shield tile (10,15) to the target tile (10,11).
    expect(transit.path[0]).toEqual({ x: 10.5, z: 15.5 });
    expect(transit.path.at(-1)).toEqual({ x: 10.5, z: 11.5 });
  });

  it("adds nothing for a battle with no shield", () => {
    const overlay = makeOverlay();
    const state = makeState(new Map([["10,11", baseBattle]]));

    syncMusterTransitOverlay(state, () => "#color", makeHeightfield(), overlay, 0, 0, () => "");

    expect(overlay.addTransit).not.toHaveBeenCalled();
  });

  it("adds a march per shielded battle when several are active at once", () => {
    const overlay = makeOverlay();
    const state = makeState(
      new Map([
        ["10,11", { ...baseBattle, shieldX: 10, shieldY: 15 }],
        ["20,21", { ...baseBattle, targetX: 20, targetY: 21, shieldX: 20, shieldY: 25 }]
      ])
    );

    syncMusterTransitOverlay(state, () => "#color", makeHeightfield(), overlay, 0, 0, () => "");

    expect(overlay.addTransit).toHaveBeenCalledTimes(2);
  });
});
