// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { HouseChargeView } from "@border-empires/shared";
import { houseChargesPanelHtml, renderHouseChargesPanel } from "./client-house-charges-panel.js";
import { HOUSE_CHARGES_DEAL_MS, houseChargesDealing, resetHouseChargesPickForTests, toggleHouseChargePick } from "./client-house-charges-pick.js";

const charge = (id: string, kept: boolean): HouseChargeView => ({
  id, kind: "SURVEY", title: `Survey ${id}`, rarity: "COMMON", renown: 2, kept, held: false, size: 0, searchCircle: { x: 5, y: 5, radius: 10 }, targets: []
});
const charges = [charge("a", true), charge("b", true), charge("c", false)];

// Owner 2026-11-19: picking charges should feel like picking between cards, not ticking boxes.
describe("House Charges keep choice", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetHouseChargesPickForTests();
  });

  it("deals one card per charge with a Keep button, kept cards marked", () => {
    const html = houseChargesPanelHtml({ activePanel: "charges", houseCharges: { type: "HOUSE_CHARGES", dealtAt: 1_000, choiceClosesAt: 10_000, charges }, houseChargesDraftKeep: undefined }, 5_000);
    document.body.innerHTML = html;
    const keeps = document.querySelectorAll<HTMLButtonElement>("[data-house-charge-pick]");
    expect(keeps).toHaveLength(3);
    expect(Array.from(keeps).map((keep) => keep.getAttribute("aria-pressed"))).toEqual(["true", "true", "false"]);
    expect(keeps[0]!.closest(".hcd-card")?.querySelector(".hc-name")?.textContent).toBe("Survey a");
    expect(keeps[2]!.textContent).toBe("Tap to keep");
  });

  // Review of #2875: auto-swapping "the oldest pick" dropped an arbitrary card of a default pair nobody had
  // picked. A tap only changes that card; a third kept card blocks saving and the hint says to set one aside.
  it("a tap keeps or sets aside only that card, and a third kept card blocks saving with a hint", () => {
    expect(toggleHouseChargePick(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleHouseChargePick(["b"], "c")).toEqual(["b", "c"]);
    expect(toggleHouseChargePick(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    const html = houseChargesPanelHtml({ activePanel: "charges", houseCharges: { type: "HOUSE_CHARGES", dealtAt: 1_000, choiceClosesAt: 10_000, charges }, houseChargesDraftKeep: ["a", "b", "c"] }, 5_000);
    expect(html).toContain("You have 3 cards kept. Tap one to set it aside: you can keep only 2.");
    expect(html).toMatch(/data-house-charges-save disabled/);
  });

  it("deals the cards once per deal, the first time the panel is shown", () => {
    expect(houseChargesDealing(1_000, 5_000)).toBe(true);
    expect(houseChargesDealing(1_000, 5_000 + HOUSE_CHARGES_DEAL_MS - 1)).toBe(true);
    expect(houseChargesDealing(1_000, 5_000 + HOUSE_CHARGES_DEAL_MS)).toBe(false);
    resetHouseChargesPickForTests();
    // Remembered across a reload.
    expect(houseChargesDealing(1_000, 9_000)).toBe(false);
    // A new deal turns over again.
    expect(houseChargesDealing(2_000, 9_000)).toBe(true);
  });

  it("the Charges panel deals the cards and shows Keep only while the choice is open, with no tick boxes", () => {
    const state = (choiceClosesAt: number) => ({ activePanel: "charges" as const, houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 1_000, choiceClosesAt, charges }, houseChargesDraftKeep: undefined });
    const open = houseChargesPanelHtml(state(10_000), 5_000);
    expect(open).toContain("hcd-deck is-dealing");
    expect(open).not.toContain('type="checkbox"');
    expect(houseChargesPanelHtml(state(10_000), 5_000 + HOUSE_CHARGES_DEAL_MS)).not.toContain("is-dealing");
    const closed = houseChargesPanelHtml(state(2_000), 5_000);
    expect(closed).not.toContain("is-dealing");
    expect(closed).not.toContain("data-house-charge-pick");
  });

  // Found driving the real client: the browser writes the card art's <rect/> back as <rect></rect>, so comparing
  // with innerHTML rebuilt the panel every HUD frame, restarting the deal and dropping taps on the cards.
  it("the panel keeps its cards between renders, so a tap lands and the deal plays once", () => {
    const panelEl = document.createElement("div");
    const state = { activePanel: "charges" as const, houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 1_000, choiceClosesAt: 10_000, charges }, houseChargesDraftKeep: undefined as string[] | undefined, camX: 0, camY: 0, camSubX: 0, camSubY: 0, zoom: 22, houseChargeFocusId: undefined };
    const deps = { root: document, panelEl, rerender: () => renderHouseChargesPanel(state, deps), requestViewRefresh: () => {}, sendGameMessage: () => true, wrapX: (x: number) => x, wrapY: (y: number) => y, now: () => 5_000, closePanel: () => {}, viewport: () => ({ width: 800, height: 600 }) };
    renderHouseChargesPanel(state, deps);
    const card = panelEl.querySelector<HTMLButtonElement>('[data-house-charge-pick="c"]');
    renderHouseChargesPanel(state, deps);
    expect(panelEl.querySelector('[data-house-charge-pick="c"]')).toBe(card);
    card!.click();
    expect(state.houseChargesDraftKeep).toEqual(["a", "b", "c"]);
  });

  // Review of #2878: opening the read-more changed the panel's HTML, so it was rewritten, dropping focus.
  it("the ? beside the title opens How charges work without rewriting the panel, and it stays open across a rewrite", () => {
    const panelEl = document.createElement("div");
    const state = { activePanel: "charges" as const, houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 1_000, choiceClosesAt: 10_000, charges }, houseChargesDraftKeep: undefined as string[] | undefined, camX: 0, camY: 0, camSubX: 0, camSubY: 0, zoom: 22, houseChargeFocusId: undefined };
    const root = document.createElement("div");
    root.innerHTML = '<button id="panel-help" type="button">?</button>';
    const deps = { root, panelEl, rerender: () => renderHouseChargesPanel(state, deps), requestViewRefresh: () => {}, sendGameMessage: () => true, wrapX: (x: number) => x, wrapY: (y: number) => y, now: () => 5_000, closePanel: () => {}, viewport: () => ({ width: 800, height: 600 }) };
    renderHouseChargesPanel(state, deps);
    const more = panelEl.querySelector<HTMLElement>("[data-house-charges-more]")!;
    expect(more.hidden).toBe(true);
    const help = root.querySelector<HTMLButtonElement>("#panel-help")!;
    help.click();
    expect(more.hidden).toBe(false);
    expect(help.getAttribute("aria-expanded")).toBe("true");
    renderHouseChargesPanel(state, deps);
    expect(panelEl.querySelector("[data-house-charges-more]")).toBe(more);
    // A real change rewrites the panel; the help stays open.
    state.houseChargesDraftKeep = ["a"];
    renderHouseChargesPanel(state, deps);
    expect(panelEl.querySelector<HTMLElement>("[data-house-charges-more]")!.hidden).toBe(false);
    help.click();
    expect(panelEl.querySelector<HTMLElement>("[data-house-charges-more]")!.hidden).toBe(true);
    // A tap on the popup itself closes it too.
    help.click();
    panelEl.querySelector<HTMLElement>("[data-house-charges-more]")!.click();
    expect(panelEl.querySelector<HTMLElement>("[data-house-charges-more]")!.hidden).toBe(true);
    expect(help.getAttribute("aria-expanded")).toBe("false");
  });
});
