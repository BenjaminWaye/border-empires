// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { HouseChargeView } from "@border-empires/shared";
import { houseChargeDeckCardHtml } from "./client-house-charges-deck.js";
import { houseChargesWithLiveNames } from "./client-house-charges-live-names.js";
import { houseChargesPanelHtml } from "./client-house-charges-panel.js";

const guestId = "3YpddqToNoQp5byMr6DHC5DPjKH2";
// What the simulation deals for a guest rival: it knows the guest only by their account id.
const correction: HouseChargeView = {
  id: `CORRECTION:house:${guestId}`, kind: "CORRECTION", title: `The Correction of House ${guestId}`, rarity: "COMMON", renown: 2,
  kept: true, held: false, size: 0, searchCircle: { x: 5, y: 5, radius: 9 }, targets: [{ key: `house:${guestId}`, name: guestId, x: 4, y: 4 }]
};
const desert: HouseChargeView = { ...correction, id: "DESERT:region:1,1", kind: "DESERT", title: "Thalanwatch Barrens", targets: [{ key: "region:1,1", name: "Thalanwatch Barrens", x: 1, y: 1 }] };
const payload = { type: "HOUSE_CHARGES" as const, dealtAt: 1, choiceClosesAt: 0, charges: [correction, desert] };
const cardOptions = { choosing: false, ticked: true, focused: false, scoutHint: undefined, formatWhen: () => "" };

describe("rival House names on charges", () => {
  // Regression (owner 2026-11-21): a Writ of Correction against a guest read "House 3YpddqToNoQp5byMr6DHC5DPjKH2"
  // everywhere on the card; the player knows that guest as "House Noname 4".
  it("shows a guest rival by the name players see, never their account id", () => {
    const live = houseChargesWithLiveNames(payload, new Map([[guestId, "House Noname 4"]]));
    const el = document.createElement("div");
    el.innerHTML = houseChargeDeckCardHtml(live.charges[0]!, cardOptions);
    const card = `${el.textContent ?? ""} ${Array.from(el.querySelectorAll("[aria-label]")).map((node) => node.getAttribute("aria-label")).join(" ")}`;
    expect(card).not.toContain(guestId.slice(0, 12));
    expect(card).toContain("The Correction of House Noname 4");
    expect(card).toContain("Capture and garrison an AFC founded by House Noname 4");
    expect(card).not.toContain("House House");
  });

  it("follows a rename, and leaves other charges and unknown rivals as dealt", () => {
    const renamed = houseChargesWithLiveNames(payload, new Map([[guestId, "Vellmark"]]));
    expect(renamed.charges[0]!.title).toBe("The Correction of House Vellmark");
    expect(renamed.charges[1]).toBe(desert);
    expect(houseChargesWithLiveNames(payload, new Map())).toBe(payload);
    expect(houseChargesWithLiveNames(null, new Map())).toBeNull();
  });

  // Review of #2922: the helper alone proves nothing if the panel stops calling it.
  it("is what the Charges panel shows", () => {
    const html = houseChargesPanelHtml({ activePanel: "charges", houseCharges: payload, houseChargesDraftKeep: undefined, playerNames: new Map([[guestId, "House Noname 4"]]) }, 5);
    expect(html).toContain("The Correction of House Noname 4");
    expect(html).not.toContain(`House ${guestId}`);
  });
});
