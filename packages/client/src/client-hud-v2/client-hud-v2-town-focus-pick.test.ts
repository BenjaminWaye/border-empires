import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { createInitialState } from "../client-state/client-state.js";
import { confirmTownFocusForAll, pickTownFocus, pickTownFocusForAll, townFocusExtras } from "./client-hud-v2-town-focus-pick.js";
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

  it("All towns re-reads live tiles, so a stale list cannot undo a capture", () => {
    const listed = [townAt(1), townAt(2)];
    const { state, sendGameMessage, deps } = setup(listed);
    state.tiles.set("2,0", townAt(2, {}, "rival"));
    expect(pickTownFocusForAll(deps, listed, "LEVY", NOW)).toBe(1);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_TOWN_FOCUS", tiles: [{ x: 1, y: 0 }], focus: "LEVY" });
    expect(state.tiles.get("2,0")?.ownerId).toBe("rival");
  });

  it("asks for a second press within a few seconds before applying to all towns", () => {
    expect(confirmTownFocusForAll("1,0", "LEVY", NOW)).toBe(false);
    expect(confirmTownFocusForAll("1,0", "LEVY", NOW + 1_000)).toBe(true);
    expect(confirmTownFocusForAll("1,0", "LEVY", NOW + 2_000)).toBe(false);
    expect(confirmTownFocusForAll("1,0", "LEVY", NOW + 9_000)).toBe(false);
  });

  it("counts a town under the focus just picked for it, so All towns knows who would change", () => {
    const { state } = setup([]);
    const extras = townFocusExtras(state, [townAt(1, { pendingFocus: "LEVY", pendingFocusAt: NOW }), townAt(2)], "1,0", NOW);
    expect(extras.counts).toMatchObject({ LEVY: 1, BALANCED: 1 });
  });

});
