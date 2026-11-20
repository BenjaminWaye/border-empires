// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { HOUSE_CHARGE_KINDS, type HouseChargesPayload, type HouseChargeView } from "@border-empires/shared";
import { houseChargeCardArtSvg } from "./client-house-charge-cards.js";
import { houseChargeEmblemSvg } from "./client-house-charge-emblems.js";
import { houseChargesDockHtml } from "./client-house-charges-bubble.js";
import { foldHouseChargeCards } from "./client-house-charges-fold.js";
import { houseChargesPanelHtml } from "./client-house-charges-panel.js";

const charge = (id: string, kind: HouseChargeView["kind"]): HouseChargeView => ({
  id, kind, title: `Charge ${id}`, rarity: "COMMON", renown: 1, kept: true, held: false, size: 0, searchCircle: { x: 5, y: 5, radius: 10 }, targets: []
});

// Owner 2026-11-19: "the two cards do different things but have the same imagery in the card art window".
describe("House Charge emblems", () => {
  it("draws a different emblem for every charge kind", () => {
    const emblems = HOUSE_CHARGE_KINDS.map((kind) => houseChargeEmblemSvg(kind));
    expect(new Set(emblems).size).toBe(HOUSE_CHARGE_KINDS.length);
    expect(houseChargeCardArtSvg({ kind: "CHARTER" })).not.toBe(houseChargeCardArtSvg({ kind: "SEAT" }));
    expect(houseChargeCardArtSvg({ kind: "SEAT" })).not.toBe(houseChargeCardArtSvg({ kind: "METROPOLIS" }));
  });
});

// Owner 2026-11-19: Show on map folds the cards into the dock with the pressed card on top.
describe("Show on map dock", () => {
  const deal: HouseChargesPayload = { type: "HOUSE_CHARGES", dealtAt: 1, choiceClosesAt: 0, charges: [charge("a", "CHARTER"), charge("b", "SEAT")] };

  it("shows the charge on the map face up on top of the docked cards", () => {
    document.body.innerHTML = houseChargesDockHtml(deal, false, "b");
    const face = document.querySelector(".hcb-cards.has-face .hc-card.is-face");
    expect(face?.classList.contains("kind-seat")).toBe(true);
    expect(houseChargesDockHtml(deal, false, "b")).toContain(houseChargeEmblemSvg("SEAT"));
    document.body.innerHTML = houseChargesDockHtml(deal, false);
    expect(document.querySelector(".is-face")).toBeNull();
  });

  it("folding is purely visual and leaves nothing behind where it cannot animate", () => {
    const panel = document.createElement("div");
    panel.innerHTML = houseChargesPanelHtml({ activePanel: "charges", houseCharges: deal, houseChargesDraftKeep: undefined }, 5);
    document.body.appendChild(panel);
    expect(() => foldHouseChargeCards(panel, "b")).not.toThrow();
    expect(document.querySelectorAll(".hcd-fold-layer .hcd-card").length).toBeLessThanOrEqual(2);
    expect(panel.querySelectorAll(".hcd-card")).toHaveLength(2);
  });

  it("gives every card a back to show while it is drawn from the deck", () => {
    const html = houseChargesPanelHtml({ activePanel: "charges", houseCharges: deal, houseChargesDraftKeep: undefined }, 5);
    document.body.innerHTML = html;
    document.querySelectorAll(".hcd-card").forEach((card) => expect(card.querySelector(".hcd-back .hc-card.is-back")).not.toBeNull());
  });
});
