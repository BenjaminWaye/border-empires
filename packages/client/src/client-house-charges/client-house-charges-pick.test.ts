// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { HouseChargeView } from "@border-empires/shared";
import { houseChargesPanelHtml, renderHouseChargesPanel } from "./client-house-charges-panel.js";
import { HOUSE_CHARGES_DEAL_MS, houseChargesDealing, houseChargesPickHtml, resetHouseChargesPickForTests, toggleHouseChargePick } from "./client-house-charges-pick.js";

const charge = (id: string, kept: boolean): HouseChargeView => ({
  id, kind: "SURVEY", title: `Survey ${id}`, rarity: "COMMON", renown: 2, kept, held: false, size: 0, searchCircle: { x: 5, y: 5, radius: 10 }, targets: []
});
const charges = [charge("a", true), charge("b", true), charge("c", false)];

// Owner 2026-11-19: picking charges should feel like picking between cards, not ticking boxes.
describe("House Charges card table", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetHouseChargesPickForTests();
  });

  it("deals one trading card per charge, kept cards raised and sealed", () => {
    const html = houseChargesPickHtml(charges, ["a", "b"], 2, false);
    document.body.innerHTML = html;
    const slots = document.querySelectorAll<HTMLButtonElement>("[data-house-charge-pick]");
    expect(slots).toHaveLength(3);
    expect(Array.from(slots).map((slot) => slot.getAttribute("aria-pressed"))).toEqual(["true", "true", "false"]);
    expect(slots[0]!.querySelector(".hcp-face .hc-card .hc-name")?.textContent).toBe("Survey a");
    expect(slots[0]!.querySelector(".hcp-back .hc-card.is-back")).not.toBeNull();
    expect(slots[2]!.textContent).toContain("Tap to keep");
  });

  it("a tap keeps or sets aside, and a third pick swaps out the oldest so the hand never exceeds two", () => {
    expect(toggleHouseChargePick(["a", "b"], "a", 2)).toEqual(["b"]);
    expect(toggleHouseChargePick(["b"], "c", 2)).toEqual(["b", "c"]);
    expect(toggleHouseChargePick(["a", "b"], "c", 2)).toEqual(["b", "c"]);
  });

  it("turns the cards over once per deal, the first time the table is shown", () => {
    expect(houseChargesDealing(1_000, 5_000)).toBe(true);
    expect(houseChargesDealing(1_000, 5_000 + HOUSE_CHARGES_DEAL_MS - 1)).toBe(true);
    expect(houseChargesDealing(1_000, 5_000 + HOUSE_CHARGES_DEAL_MS)).toBe(false);
    resetHouseChargesPickForTests();
    // Remembered across a reload.
    expect(houseChargesDealing(1_000, 9_000)).toBe(false);
    // A new deal turns over again.
    expect(houseChargesDealing(2_000, 9_000)).toBe(true);
  });

  it("the Charges panel shows the table only while the choice is open, with no tick boxes", () => {
    const state = (choiceClosesAt: number) => ({ activePanel: "charges" as const, houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 1_000, choiceClosesAt, charges }, houseChargesDraftKeep: undefined });
    const open = houseChargesPanelHtml(state(10_000), 5_000);
    expect(open).toContain("hcp-table is-dealing");
    expect(open).not.toContain('type="checkbox"');
    expect(houseChargesPanelHtml(state(10_000), 5_000 + HOUSE_CHARGES_DEAL_MS)).not.toContain("is-dealing");
    expect(houseChargesPanelHtml(state(2_000), 5_000)).not.toContain("hcp-table");
  });

  // Found driving the real client: the browser writes the card art's <rect/> back as <rect></rect>, so comparing
  // with innerHTML rebuilt the panel every HUD frame, restarting the deal and dropping taps on the cards.
  it("the panel keeps its cards between renders, so a tap lands and the deal plays once", () => {
    const panelEl = document.createElement("div");
    const state = { activePanel: "charges" as const, houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 1_000, choiceClosesAt: 10_000, charges }, houseChargesDraftKeep: undefined as string[] | undefined, camX: 0, camY: 0, camSubX: 0, camSubY: 0, selected: undefined, houseChargeFocusId: undefined };
    const deps = { root: document, panelEl, rerender: () => renderHouseChargesPanel(state, deps), requestViewRefresh: () => {}, sendGameMessage: () => true, wrapX: (x: number) => x, wrapY: (y: number) => y, now: () => 5_000 };
    renderHouseChargesPanel(state, deps);
    const card = panelEl.querySelector<HTMLButtonElement>('[data-house-charge-pick="c"]');
    renderHouseChargesPanel(state, deps);
    expect(panelEl.querySelector('[data-house-charge-pick="c"]')).toBe(card);
    card!.click();
    expect(state.houseChargesDraftKeep).toEqual(["b", "c"]);
  });
});
