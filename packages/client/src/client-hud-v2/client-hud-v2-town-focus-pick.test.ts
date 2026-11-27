import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { createInitialState } from "../client-state/client-state.js";
import { pickTownFocus, pickTownFocusForAll, selectTownFocus, selectedTownFocus, townFocusExtras } from "./client-hud-v2-town-focus-pick.js";
import type { HudV2Deps } from "./client-hud-v2-context.js";

const NOW = 1_800_000_000_000;
const townAt = (x: number, over: Partial<NonNullable<Tile["town"]>> = {}, ownerId = "me"): Tile => ({
  x, y: 0, terrain: "LAND", ownerId, ownershipState: "SETTLED",
  town: { name: `T${x}`, type: "MARKET", baseGoldPerMinute: 1, supportCurrent: 8, supportMax: 8, goldPerMinute: 1, cap: 0, isFed: true, population: 50, maxPopulation: 100, populationTier: "TOWN", connectedTownCount: 0, connectedTownBonus: 0, hasManufactory: false, manufactoryActive: false, hasIncubationEngine: false, incubationEngineActive: false, ...over }
});
const setup = (tiles: Tile[]) => {
  const state = createInitialState();
  state.me = "me";
  state.tiles = new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
  const sendGameMessage = vi.fn(() => true);
  return { state, sendGameMessage, deps: { state, sendGameMessage } as unknown as HudV2Deps };
};

describe("town focus picks", () => {
  it("queues the focus locally and sends one command", () => {
    const { state, sendGameMessage, deps } = setup([townAt(1)]);
    expect(pickTownFocus(deps, "1,0", "LEVY", NOW)).toBe(true);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_TOWN_FOCUS", tiles: [{ x: 1, y: 0 }], focus: "LEVY" });
    expect(state.tiles.get("1,0")?.town?.pendingFocus).toBe("LEVY");
  });

  it("refuses a locked town without sending anything", () => {
    const { sendGameMessage, deps } = setup([townAt(1, { focusLockedUntil: NOW + 60_000 })]);
    expect(pickTownFocus(deps, "1,0", "LEVY", NOW)).toBe(false);
    expect(sendGameMessage).not.toHaveBeenCalled();
  });

  it("previews a pick without sending, shows it on the card and clears it once confirmed", () => {
    const { state, sendGameMessage, deps } = setup([townAt(1)]);
    selectTownFocus(deps, "1,0", "COMMERCE");
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(townFocusExtras(state, [state.tiles.get("1,0")!], "1,0", NOW).selected).toBe("COMMERCE");
    pickTownFocus(deps, "1,0", "COMMERCE", NOW);
    expect(selectedTownFocus("1,0")).toBeUndefined();
    selectTownFocus(deps, "1,0", "COMMERCE");
    expect(selectedTownFocus("1,0")).toBeUndefined();
  });

  it("All towns skips ungarrisoned towns, which the server would not change", () => {
    const listed = [townAt(1), { ...townAt(2), ownershipState: "FRONTIER" as const }];
    const { state, sendGameMessage, deps } = setup(listed);
    expect(pickTownFocusForAll(deps, listed, "GROWTH", NOW)).toBe(1);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_TOWN_FOCUS", tiles: [{ x: 1, y: 0 }], focus: "GROWTH" });
    expect(state.tiles.get("2,0")?.town?.pendingFocus).toBeUndefined();
  });

  it("All towns skips locked towns", () => {
    const listed = [townAt(1), townAt(2, { focusLockedUntil: NOW + 1 })];
    const { sendGameMessage, deps } = setup(listed);
    expect(pickTownFocusForAll(deps, listed, "GROWTH", NOW)).toBe(1);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_TOWN_FOCUS", tiles: [{ x: 1, y: 0 }], focus: "GROWTH" });
  });

  it("All towns re-reads live tiles, so a stale list cannot undo a capture", () => {
    const listed = [townAt(1), townAt(2)];
    const { state, sendGameMessage, deps } = setup(listed);
    state.tiles.set("2,0", townAt(2, {}, "rival"));
    expect(pickTownFocusForAll(deps, listed, "LEVY", NOW)).toBe(1);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_TOWN_FOCUS", tiles: [{ x: 1, y: 0 }], focus: "LEVY" });
    expect(state.tiles.get("2,0")?.ownerId).toBe("rival");
  });
});
