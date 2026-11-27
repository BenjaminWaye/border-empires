// @vitest-environment happy-dom
// 2026-11-27: the Manpower panel's muster flag rows ignored taps. The panel
// redraws every second and set innerHTML each time, so the row pressed was
// gone by the time the tap finished. Rows must survive a redraw.
import { beforeEach, describe, expect, it } from "vitest";
import { musterDrawLog } from "../client-muster-draw-log/client-muster-draw-log.js";
import { createInitialState } from "../client-state/client-state.js";
import { renderManpowerPanelHtml } from "../client-side-panel-html/client-side-panel-html.js";
import type { Tile } from "../client-types.js";
import { renderHudManpowerPanel } from "./client-hud-manpower-panel.js";

const flagTile = (amount: number, updatedAt: number): Tile => ({
  x: 7,
  y: 9,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  muster: { ownerId: "me", amount, mode: "HOLD", updatedAt, ratePerMin: 60 }
});

const setup = () => {
  const state = createInitialState();
  state.me = "me";
  state.manpower = 400;
  state.manpowerCap = 1_500;
  state.tiles.set("7,9", flagTile(20, 1_000));
  const hud = document.createElement("div");
  const panelManpowerEl = document.createElement("div");
  hud.appendChild(panelManpowerEl);
  document.body.appendChild(hud);
  let refreshes = 0;
  const render = (): void =>
    renderHudManpowerPanel({
      state,
      dom: { hud, panelManpowerEl },
      renderManpowerPanelHtml,
      formatManpowerAmount: (value) => String(Math.floor(value)),
      rateToneClass: () => "",
      wrapX: (x) => x,
      wrapY: (y) => y,
      requestViewRefresh: () => { refreshes += 1; },
      sendGameMessage: () => true,
      rerender: () => undefined,
      safeHtml: (_label, _fallback, run) => run(),
      fallbackHtml: ""
    });
  return { state, panelManpowerEl, render, refreshes: () => refreshes };
};

const row = (root: HTMLElement): HTMLButtonElement => root.querySelector<HTMLButtonElement>("[data-muster-focus-x]")!;

describe("Manpower panel redraw", () => {
  beforeEach(() => musterDrawLog.clear());

  it("keeps the flag row element across a redraw, so a tap started before it still lands", () => {
    const { state, panelManpowerEl, render, refreshes } = setup();
    render();
    const pressed = row(panelManpowerEl);
    state.tiles.set("7,9", flagTile(80, 2_000));
    render();
    expect(row(panelManpowerEl)).toBe(pressed);
    expect(pressed.textContent).toContain("80 / 150");
    pressed.click();
    expect(refreshes()).toBe(1);
    expect(state.selected).toEqual({ x: 7, y: 9 });
  });

  it("shows what the flag drew lately, its fill target and the pool drain", () => {
    const { state, panelManpowerEl, render } = setup();
    render();
    state.tiles.set("7,9", flagTile(80, 2_000));
    render();
    const text = (panelManpowerEl.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("Drew 60 in 10m · −60/min · fills to 150");
    expect(text).toContain("Refilling from your pool: −60/min");
  });
});
