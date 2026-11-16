// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_SETTLE_CATEGORIES, NO_AUTO_IMPROVE, type AutoSettleCategory, type AutoImprovePrefs } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { DECLINED_HIGHLIGHT_MS, isDeclinedHighlightActive, markAutoSettleAsked, resetAutoSettleAskStateForTests } from "./client-auto-settle-ask.js";
import { installAutoSettleSettingsBinding } from "./client-auto-settle-settings-ui.js";
import { loadedAutoSettleState } from "./client-auto-settle-prefs.js";
import {
  autoSettleOptionForTile,
  autoSettleOptionHtml,
  installAutoSettleTileOptionBinding,
  settleOutcomeText
} from "./client-auto-settle-tile-option.js";

const switches = (...on: AutoSettleCategory[]): Record<AutoSettleCategory, boolean> =>
  Object.fromEntries(AUTO_SETTLE_CATEGORIES.map((category) => [category, on.includes(category)])) as Record<AutoSettleCategory, boolean>;
const only = (...on: AutoSettleCategory[]): Record<AutoSettleCategory, boolean> & { improve: AutoImprovePrefs } => ({ ...switches(...on), improve: { ...NO_AUTO_IMPROVE } });

const tile = (extra: Partial<Tile>): Tile => ({ x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", ...extra }) as Tile;

describe("settleOutcomeText", () => {
  it("states food-slot upkeep for a town, and how short it would leave you", () => {
    const state = createInitialState();
    state.resourceSlots.supply.FOOD = 1;
    state.resourceSlots.demand.FOOD = 0;
    const text = settleOutcomeText(state, tile({ town: { populationTier: "TOWN" } as never }));
    expect(text).toMatch(/^Gain: \+ Coin, \+ Manpower\. Upkeep: \d+ food slots? \(\d+ short/);
  });

  it("says upkeep is none for farms, fish, resources and docks", () => {
    const state = createInitialState();
    expect(settleOutcomeText(state, tile({ resource: "FARM" }))).toBe("Gain: +1 food slot. Upkeep: none.");
    expect(settleOutcomeText(state, tile({ resource: "FISH" }))).toBe("Gain: +2 food slots. Upkeep: none.");
    expect(settleOutcomeText(state, tile({ resource: "TITANIUM" }))).toBe("Gain: +1 titanium slot. Upkeep: none.");
    expect(settleOutcomeText(state, tile({ dockId: "d1" }))).toBe("Gain: + Coin. Upkeep: none.");
  });

  it("stays silent for a plain tile", () => {
    expect(settleOutcomeText(createInitialState(), tile({}))).toBe("");
  });
});

const resetDom = (): void => {
  document.body.innerHTML = "";
  (document as { __autoSettleTileOptionBound?: boolean }).__autoSettleTileOptionBound = false;
  localStorage.clear();
  resetAutoSettleAskStateForTests();
};

describe("auto-settle checkbox", () => {
  beforeEach(() => {
    resetDom();
    AUTO_SETTLE_CATEGORIES.forEach(markAutoSettleAsked); // already answered: the plain checkbox shows
  });

  it("is hidden until prefs load, then reflects the tile's own resource", () => {
    const state = createInitialState();
    expect(autoSettleOptionForTile(state, tile({ resource: "FARM" }))).toBeUndefined();
    state.autoSettle = loadedAutoSettleState({ answered: true, ...only("FARM", "TITANIUM") });
    expect(autoSettleOptionForTile(state, tile({ resource: "FARM" }))).toMatchObject({ category: "FARM", checked: true });
    expect(autoSettleOptionForTile(state, tile({ resource: "TITANIUM" }))).toMatchObject({ category: "TITANIUM", checked: true, label: "Garrison titanium tiles automatically from now on" });
    expect(autoSettleOptionForTile(state, tile({ resource: "GEMS" }))).toMatchObject({ category: "GEMS", checked: false });
    expect(autoSettleOptionForTile(state, tile({ resource: "PRECURSOR_SALVAGE" }))).toMatchObject({
      category: "PRECURSOR_SALVAGE", checked: false, label: "Garrison precursor salvage tiles automatically from now on"
    });
    expect(autoSettleOptionForTile(state, tile({ dockId: "d" }))).toMatchObject({ category: "towns", checked: false });
  });

  it("is not offered on a natural wonder (it would fall into the towns setting)", () => {
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ answered: true, ...only(...AUTO_SETTLE_CATEGORIES) });
    expect(autoSettleOptionForTile(state, tile({ naturalWonder: { type: "QUICKFORGE" } }))).toBeUndefined();
  });

  it("toggling sends every switch with only that tile's resource changed", () => {
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ answered: false, ...only("FARM") });
    const send = vi.fn(() => true);
    installAutoSettleTileOptionBinding(state, send);
    document.body.innerHTML = autoSettleOptionHtml(autoSettleOptionForTile(state, tile({ resource: "PRECURSOR_SALVAGE" }))!);
    const box = document.querySelector<HTMLInputElement>("[data-tile-auto-settle]")!;
    box.click();
    expect(send).toHaveBeenCalledWith({ type: "SET_AUTO_SETTLE_PREFS", ...switches("FARM", "PRECURSOR_SALVAGE") });
    expect(state.autoSettle).toEqual(loadedAutoSettleState({ answered: true, ...only("FARM", "PRECURSOR_SALVAGE") }));
  });

  it("keeps the auto-improve switches when toggling a garrison switch", () => {
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ answered: true, ...only(), improve: { ...NO_AUTO_IMPROVE, PRECURSOR_SALVAGE: true } });
    installAutoSettleTileOptionBinding(state, () => true);
    document.body.innerHTML = autoSettleOptionHtml(autoSettleOptionForTile(state, tile({ resource: "FARM" }))!);
    document.querySelector<HTMLInputElement>("[data-tile-auto-settle]")!.click();
    expect(state.autoSettle.status === "loaded" && state.autoSettle.prefs.improve.PRECURSOR_SALVAGE).toBe(true);
  });

  it("un-ticks itself when the message could not be sent", () => {
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ answered: true, ...only() });
    installAutoSettleTileOptionBinding(state, () => false);
    document.body.innerHTML = autoSettleOptionHtml(autoSettleOptionForTile(state, tile({ resource: "FARM" }))!);
    const box = document.querySelector<HTMLInputElement>("[data-tile-auto-settle]")!;
    box.click();
    expect(box.checked).toBe(false);
    expect(state.autoSettle).toEqual(loadedAutoSettleState({ answered: true, ...only() }));
  });
});

describe("auto-settle question (category off, never asked)", () => {
  beforeEach(resetDom);

  const render = (state: ReturnType<typeof createInitialState>, at: Tile): void => {
    document.body.innerHTML = autoSettleOptionHtml(autoSettleOptionForTile(state, at)!);
  };
  const answer = (which: "yes" | "no"): void => document.querySelector<HTMLButtonElement>(`[data-tile-auto-settle-answer="${which}"]`)!.click();

  it("asks Yes/No instead of showing the easy-to-miss checkbox", () => {
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ answered: false, ...only() });
    installAutoSettleTileOptionBinding(state, () => true);
    render(state, tile({ resource: "FARM" }));
    expect(document.querySelector("[data-tile-auto-settle-ask=FARM]")?.textContent).toContain("Garrison farm tiles automatically from now on?");
    expect(document.querySelector("[data-tile-auto-settle]")).toBeNull();
  });

  it("doesn't ask when that category is already on", () => {
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ answered: true, ...only("FARM") });
    installAutoSettleTileOptionBinding(state, () => true);
    render(state, tile({ resource: "FARM" }));
    expect(document.querySelector("[data-tile-auto-settle-ask]")).toBeNull();
    expect(document.querySelector<HTMLInputElement>("[data-tile-auto-settle=FARM]")?.checked).toBe(true);
  });

  it("Yes turns that category on and shows the ticked checkbox; never asks again", () => {
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ answered: false, ...only() });
    const send = vi.fn(() => true);
    installAutoSettleTileOptionBinding(state, send);
    render(state, tile({ resource: "FARM" }));
    answer("yes");
    expect(send).toHaveBeenCalledWith({ type: "SET_AUTO_SETTLE_PREFS", ...switches("FARM") });
    expect(state.autoSettle).toEqual(loadedAutoSettleState({ answered: true, ...only("FARM") }));
    expect(document.querySelector<HTMLInputElement>("[data-tile-auto-settle=FARM]")?.checked).toBe(true);
    expect(document.querySelector(".is-highlighted")).toBeNull();
    resetAutoSettleAskStateForTests(); // a reload: the answer survives in localStorage
    state.autoSettle = loadedAutoSettleState({ answered: true, ...only() });
    render(state, tile({ resource: "FARM" }));
    expect(document.querySelector("[data-tile-auto-settle-ask]")).toBeNull();
  });

  it("No sends nothing and shows the unticked checkbox highlighted for a while, on any panel showing that kind", () => {
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ answered: false, ...only() });
    const send = vi.fn(() => true);
    installAutoSettleTileOptionBinding(state, send);
    render(state, tile({ resource: "FARM" }));
    answer("no");
    expect(send).not.toHaveBeenCalled();
    const box = document.querySelector<HTMLInputElement>("[data-tile-auto-settle=FARM]");
    expect(box?.checked).toBe(false);
    expect(box?.closest(".tile-auto-settle-option")?.classList.contains("is-highlighted")).toBe(true);
    expect(document.body.textContent).toContain("Change anytime");
    render(state, tile({ resource: "FARM" })); // a repaint of the same tile keeps the highlight
    expect(document.querySelector(".tile-auto-settle-option.is-highlighted")).not.toBeNull();
    render(state, tile({ x: 9, resource: "FARM" })); // another panel/tile of the same kind: rendering never clears it
    expect(document.querySelector(".tile-auto-settle-option.is-highlighted")).not.toBeNull();
    expect(document.querySelector("[data-tile-auto-settle-ask]")).toBeNull();
    render(state, tile({ resource: "FISH" })); // a different kind is still asked, unhighlighted
    expect(document.querySelector("[data-tile-auto-settle-ask=FISH]")).not.toBeNull();
    expect(isDeclinedHighlightActive("FARM", Date.now() + DECLINED_HIGHLIGHT_MS + 1)).toBe(false);
  });

  it("No in one panel after Yes in another shows the live (ticked) pref, not the answer", () => {
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ answered: false, ...only() });
    installAutoSettleTileOptionBinding(state, () => true);
    const option = autoSettleOptionForTile(state, tile({ resource: "FARM" }))!;
    document.body.innerHTML = `<div id="a">${autoSettleOptionHtml(option)}</div><div id="b">${autoSettleOptionHtml(option)}</div>`;
    document.querySelector<HTMLButtonElement>('#a [data-tile-auto-settle-answer="yes"]')!.click();
    document.querySelector<HTMLButtonElement>('#b [data-tile-auto-settle-answer="no"]')!.click();
    expect(document.querySelector<HTMLInputElement>("#b [data-tile-auto-settle=FARM]")?.checked).toBe(true);
  });

  it("a choice in Settings counts as an answer", () => {
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ answered: true, ...only() });
    installAutoSettleTileOptionBinding(state, () => true);
    (document as { __autoSettleSettingsBound?: boolean }).__autoSettleSettingsBound = false;
    installAutoSettleSettingsBinding(() => true);
    document.body.innerHTML = `<input type="checkbox" data-settings-auto-settle="GEMS" />`;
    document.querySelector<HTMLInputElement>("[data-settings-auto-settle]")!.click();
    render(state, tile({ resource: "GEMS" }));
    expect(document.querySelector("[data-tile-auto-settle-ask]")).toBeNull();
    expect(document.querySelector("[data-tile-auto-settle=GEMS]")).not.toBeNull();
  });

  it("keeps asking when the answer could not be sent (not signed in yet)", () => {
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ answered: false, ...only() });
    installAutoSettleTileOptionBinding(state, () => false);
    render(state, tile({ resource: "FARM" }));
    answer("yes");
    expect(document.querySelector("[data-tile-auto-settle-ask=FARM]")).not.toBeNull();
  });

  it("markup built from a stale view still shows the live answer", () => {
    const state = createInitialState();
    state.autoSettle = loadedAutoSettleState({ answered: false, ...only() });
    installAutoSettleTileOptionBinding(state, () => true);
    const stale = autoSettleOptionForTile(state, tile({ resource: "FARM" }))!;
    document.body.innerHTML = autoSettleOptionHtml(stale);
    answer("yes");
    expect(autoSettleOptionHtml(stale)).toMatch(/data-tile-auto-settle="FARM" checked/);
  });
});
