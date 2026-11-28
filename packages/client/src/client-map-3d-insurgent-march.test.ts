import { afterEach, describe, expect, it, vi } from "vitest";
import { syncMusterTransitOverlay } from "./client-map-3d-muster-transit-sync.js";
import type { Heightfield } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";
import type { MusterTransit, MusterTransitOverlay } from "./client-map-3d-muster-transit-overlay.js";
import type { ClientState } from "./client-state/client-state.js";
import { clearInsurgentMarches, recordInsurgentMarch } from "./client-insurgent-march/client-insurgent-march.js";
import { PLANETARY_DEFENSE_ARMOR_COLOR } from "./client-planetary-defense-style.js";

// True-3D side of the insurgent march (client-insurgent-march.ts): the
// company walks from its camp to the launch tile in Planetary Defense armor,
// whoever is watching -- not only the House it attacks.
const makeOverlay = (): MusterTransitOverlay => ({
  clear: vi.fn(), addTransit: vi.fn(), addVoyage: vi.fn(), commit: vi.fn(), tick: vi.fn(), dispose: vi.fn()
});

const state = {
  camX: 0, camY: 0, me: "player-9", playerCosmetics: new Map(), dockPairs: [],
  musterTransitByCommand: new Map(), outgoingMusterAttacksByTile: new Map(), incomingAttacksByTile: new Map(),
  deferredAttackByCommand: new Map(), tiles: new Map(), squadGearByOwner: new Map(), activeBattles: new Map()
} as unknown as ClientState;

afterEach(() => {
  clearInsurgentMarches();
  vi.useRealTimers();
});

describe("syncMusterTransitOverlay -- insurgent march", () => {
  it("walks the insurgent company from its camp to the launch tile in their armor", () => {
    vi.useFakeTimers();
    vi.setSystemTime(12_000);
    recordInsurgentMarch({
      commandId: "barb-1", actionType: "EXPAND", campX: 5, campY: 5, fromX: 8, fromY: 5, toX: 8, toY: 6,
      marchMs: 6_000, transitEndsAt: 16_000, resolvesAt: 40_000
    }, 12_000);
    const overlay = makeOverlay();
    syncMusterTransitOverlay(state, () => "#mine", { elevationAt: () => 0, cornerYAt: () => 0 } as unknown as Heightfield, overlay, 0, 0, (x, y) => `${x},${y}`);
    expect(overlay.addTransit).toHaveBeenCalledTimes(1);
    const transit = vi.mocked(overlay.addTransit).mock.calls[0]![0] as MusterTransit;
    expect(transit.ownerColor).toBe(PLANETARY_DEFENSE_ARMOR_COLOR);
    expect(transit.startAt).toBe(10_000);
    expect(transit.arriveAt).toBe(16_000);
    expect(transit.path.length).toBeGreaterThanOrEqual(2);

    // Arrived: the fight or claim takes over, the road is empty.
    vi.setSystemTime(16_000);
    const after = makeOverlay();
    syncMusterTransitOverlay(state, () => "#mine", { elevationAt: () => 0, cornerYAt: () => 0 } as unknown as Heightfield, after, 0, 0, (x, y) => `${x},${y}`);
    expect(after.addTransit).not.toHaveBeenCalled();
  });
});
