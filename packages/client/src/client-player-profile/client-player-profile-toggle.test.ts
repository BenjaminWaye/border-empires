// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { wirePlayerProfileOverlay } from "./client-player-profile.js";

const wire = (activePlayerProfileId: string | undefined) => {
  const hud = document.createElement("div");
  hud.innerHTML = `<button class="stat-chip stat-chip-player" data-player-name-id="p1"></button><span data-player-name-id="p2"></span>`;
  const state: { activePlayerProfileId: string | undefined } = { activePlayerProfileId };
  wirePlayerProfileOverlay({ hud, playerProfileOverlayEl: document.createElement("div") }, state, () => undefined);
  const click = (id: string) => hud.querySelector<HTMLElement>(`[data-player-name-id="${id}"]`)?.click();
  return { state, click };
};

describe("player chip profile toggle", () => {
  // Regression: a second press on your own player chip left your profile open (phones, legacy HUD).
  it("closes your profile on a second press of your player chip", () => {
    const { state, click } = wire(undefined);
    click("p1");
    expect(state.activePlayerProfileId).toBe("p1");
    click("p1");
    expect(state.activePlayerProfileId).toBeUndefined();
  });

  it("opens your profile from the chip while someone else's is showing", () => {
    const { state, click } = wire("p2");
    click("p1");
    expect(state.activePlayerProfileId).toBe("p1");
  });

  it("keeps other player names opening, not toggling", () => {
    const { state, click } = wire("p2");
    click("p2");
    expect(state.activePlayerProfileId).toBe("p2");
  });
});
