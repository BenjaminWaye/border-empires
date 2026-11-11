import { describe, expect, it, vi } from "vitest";
import { buildMusterActions, dispatchMusterTileAction } from "../client-muster-tile-actions.js";
import { createInitialState, type ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { musterStatusText } from "../client-side-panel-html/client-side-panel-html.js";

vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });

const tile = (overrides: Partial<Tile>): Tile => ({ x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", ...overrides });
const NOW = 1_000_000;

// Own frontier (2,150) is being captured by Planetary Defense, as in the
// reported screenshot; a holding flag sits 4 tiles away.
const capturedState = (flagMode: "HOLD" | "MARCH" = "HOLD"): ClientState => {
  const state = createInitialState();
  state.me = "me";
  state.manpowerCap = 1_000;
  state.manpower = 1_000;
  state.tiles.set("2,150", tile({ x: 2, y: 150 }));
  state.tiles.set("6,150", tile({ x: 6, y: 150, ownershipState: "SETTLED", muster: { ownerId: "me", amount: 120, mode: flagMode, updatedAt: 0, ...(flagMode === "MARCH" ? { targetX: 9, targetY: 9 } : {}) } }));
  state.incomingAttacksByTile.set("2,150", { attackerName: "Planetary Defense", attackerId: "barbarian-1", resolvesAt: NOW + 10_000 });
  return state;
};

describe("Hunt Planetary Defense on a tile it is capturing", () => {
  it("offers to send the nearest holding flag after the attackers", () => {
    const state = capturedState();
    const actions = buildMusterActions(state.tiles.get("2,150")!, state, NOW);
    expect(actions[0]).toMatchObject({ id: "muster_hunt_attackers", label: "Hunt Planetary Defense", disabled: false });
    expect(actions[0]?.detail).toContain("(6, 150)");
  });

  it("sends that flag hunting, aimed at the captured tile so it strikes when they land", () => {
    const state = capturedState();
    const sendGameMessage = vi.fn(() => true);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      dispatchMusterTileAction("muster_hunt_attackers", state.tiles.get("2,150")!, { state, sendGameMessage, pushFeed: vi.fn(), renderHud: vi.fn() });
    } finally {
      vi.useRealTimers();
    }
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_MUSTER", x: 6, y: 150, mode: "ADVANCE", hunt: true, targetX: 2, targetY: 150 });
  });

  it("explains why when no flag can take the order (a marching flag is busy)", () => {
    const state = capturedState("MARCH");
    const [action] = buildMusterActions(state.tiles.get("2,150")!, state, NOW);
    expect(action).toMatchObject({ id: "muster_hunt_attackers", disabled: true });
  });

  it("is not offered when a rival, not Planetary Defense, is attacking", () => {
    const state = capturedState();
    state.incomingAttacksByTile.set("2,150", { attackerName: "Rival", attackerId: "rival", resolvesAt: NOW + 10_000 });
    expect(buildMusterActions(state.tiles.get("2,150")!, state, NOW).map((a) => a.id)).not.toContain("muster_hunt_attackers");
  });
});

describe("Hunt Planetary Defense on a flag", () => {
  it("sends SET_MUSTER ADVANCE with hunt", () => {
    const state = capturedState();
    const sendGameMessage = vi.fn(() => true);
    dispatchMusterTileAction("muster_hunt", state.tiles.get("6,150")!, { state, sendGameMessage, pushFeed: vi.fn(), renderHud: vi.fn() });
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_MUSTER", x: 6, y: 150, mode: "ADVANCE", hunt: true });
  });

  it("offers Set Advance (everything) instead of Hunt on a hunting flag", () => {
    const state = capturedState();
    const flag = tile({ x: 6, y: 150, muster: { ownerId: "me", amount: 120, mode: "ADVANCE", hunt: true, updatedAt: 0 } });
    const ids = buildMusterActions(flag, state, NOW).map((a) => a.id);
    expect(ids).toContain("muster_advance");
    expect(ids).not.toContain("muster_hunt");
  });

  it("says the flag is hunting Planetary Defense", () => {
    expect(musterStatusText({ mode: "ADVANCE", amount: 80, x: 1, y: 1, hunt: true }, NOW)).toBe("Hunting Planetary Defense — 80 manpower staged.");
  });
});
