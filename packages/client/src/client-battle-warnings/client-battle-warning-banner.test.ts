// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { BATTLE_WARNING_BANNER_ID, createBattleWarningBanner } from "./client-battle-warning-banner.js";
import { battleWarningView, createBattleWarningStore, recordOwnTileLosses } from "./client-battle-warnings.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("battle warning banner", () => {
  it("shows the terse alert and jumps the camera to the fight on tap", () => {
    const state = createInitialState();
    state.me = "me";
    const store = createBattleWarningStore();
    const now = Date.now();
    recordOwnTileLosses(store, state, [{ x: 40, y: 22, newOwnerId: "barbarian-1" }], now);
    const banner = createBattleWarningBanner(state, store);
    banner.sync(battleWarningView(store, state, now));
    const el = document.getElementById(BATTLE_WARNING_BANNER_ID) as HTMLButtonElement;
    expect(el.textContent).toBe("Under attack · Planetary Defense · 1 tile lost");
    expect(el.style.display).toBe("block");
    el.click();
    expect([state.camX, state.camY]).toEqual([40, 22]);
    expect(state.selected).toEqual({ x: 40, y: 22 });
    // Tapped: hidden until the next loss.
    banner.sync(battleWarningView(store, state, now));
    expect(el.style.display).toBe("none");
  });

  it("creates no element until there is something to show", () => {
    const state = createInitialState();
    createBattleWarningBanner(state, createBattleWarningStore()).sync(undefined);
    expect(document.getElementById(BATTLE_WARNING_BANNER_ID)).toBeNull();
  });
});
