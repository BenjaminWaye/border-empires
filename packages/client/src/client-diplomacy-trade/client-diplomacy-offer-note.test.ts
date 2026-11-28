// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { ResourceTradeOffer } from "@border-empires/shared";
import { OFFER_NOTE_ROW_HTML, handleOfferNoteTap, offerNoteField, offerNoteRefusalText, syncOfferNoteRow } from "./client-diplomacy-offer-note.js";
import { resourceOfferCardsHtml } from "./client-resource-offer-cards.js";

const overlayWithRow = (): HTMLElement => {
  const overlay = document.createElement("div");
  overlay.innerHTML = OFFER_NOTE_ROW_HTML;
  return overlay;
};
const rowHidden = (overlay: HTMLElement): boolean => overlay.querySelector<HTMLElement>("[data-trade-note]")!.hidden;
const type = (overlay: HTMLElement, text: string): void => {
  overlay.querySelector<HTMLInputElement>("[data-trade-note-input]")!.value = text;
};

// First-15 round 1 owner decision: truce, alliance and trade offers carry a short free-text note.
describe("offer message row", () => {
  it("sends typed text, cleaned and capped like the server does", () => {
    const overlay = overlayWithRow();
    syncOfferNoteRow(overlay, "truce", false);
    expect(offerNoteField(overlay)).toEqual({});
    type(overlay, "  Peace   while we <i>grow</i>? ");
    expect(offerNoteField(overlay)).toEqual({ note: "Peace while we i grow /i ?" });
    type(overlay, "x".repeat(300));
    expect(offerNoteField(overlay).note).toHaveLength(140);
    expect(overlay.querySelector("[data-trade-note-input]")!.getAttribute("maxlength")).toBe("140");
  });

  it("fills the box from a preset, and clears it on a second tap", () => {
    const overlay = overlayWithRow();
    syncOfferNoteRow(overlay, "truce", false);
    const chip = overlay.querySelector<HTMLElement>('[data-trade-note-id="grow-in-peace"]')!;
    expect(handleOfferNoteTap(overlay, chip)).toBe(true);
    expect(offerNoteField(overlay)).toEqual({ note: "Truce while we both grow?" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    handleOfferNoteTap(overlay, chip);
    expect(offerNoteField(overlay)).toEqual({});
  });

  it("shows for trades without presets, hides for gifts and AI rulers, and keeps typed text across offer kinds", () => {
    const overlay = overlayWithRow();
    syncOfferNoteRow(overlay, "trade", false);
    expect(rowHidden(overlay)).toBe(false);
    expect(overlay.querySelectorAll("[data-trade-note-id]")).toHaveLength(0);
    type(overlay, "Biota for coin?");
    syncOfferNoteRow(overlay, "alliance", false);
    expect(offerNoteField(overlay)).toEqual({ note: "Biota for coin?" });
    syncOfferNoteRow(overlay, "gift", false);
    expect(rowHidden(overlay)).toBe(true);
    expect(offerNoteField(overlay)).toEqual({});
    syncOfferNoteRow(overlay, "truce", true);
    expect(rowHidden(overlay)).toBe(true);
  });

  it("drops a truce preset when the offer becomes an alliance", () => {
    const overlay = overlayWithRow();
    syncOfferNoteRow(overlay, "truce", false);
    handleOfferNoteTap(overlay, overlay.querySelector('[data-trade-note-id="quiet-border"]'));
    syncOfferNoteRow(overlay, "alliance", false);
    expect(offerNoteField(overlay)).toEqual({});
    expect(overlay.textContent).toContain("Join me against our common enemy?");
  });

  it("says when a note would be refused", () => {
    const overlay = overlayWithRow();
    syncOfferNoteRow(overlay, "truce", false);
    type(overlay, "sh1t deal");
    expect(offerNoteRefusalText(overlay)).toBe("Keep your message civil.");
    type(overlay, "fair deal");
    expect(offerNoteRefusalText(overlay)).toBeUndefined();
  });

  it("shows a trade offer's note on its card as text", () => {
    const offer: ResourceTradeOffer = { id: "o1", fromPlayerId: "them", toPlayerId: "me", fromPlayerName: "Beejac", toPlayerName: "Me",
      terms: { give: { gold: 0 }, ask: { gold: 0, resources: { FOOD: 1 } } }, createdAt: 0, expiresAt: 1_000, status: "pending", note: "Food & peace" };
    expect(resourceOfferCardsHtml([offer], "me", "them")).toContain("“Food &amp; peace”");
    expect(resourceOfferCardsHtml([{ ...offer, note: undefined }], "me", "them")).not.toContain("diplomacy-resource-note");
  });
});
