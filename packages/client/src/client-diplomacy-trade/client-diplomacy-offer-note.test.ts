// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { OFFER_NOTE_ROW_HTML, handleOfferNoteTap, offerNoteField, syncOfferNoteRow } from "./client-diplomacy-offer-note.js";

const overlayWithRow = (): HTMLElement => {
  const overlay = document.createElement("div");
  overlay.innerHTML = OFFER_NOTE_ROW_HTML;
  return overlay;
};

// Playtest Run 4 follow-up: a truce or alliance offer can carry one preset line.
describe("offer message row", () => {
  it("offers the truce lines, attaches the tapped one, and untaps it", () => {
    const overlay = overlayWithRow();
    syncOfferNoteRow(overlay, "truce", false);
    expect(overlay.textContent).toContain("Truce while we both grow?");
    expect(offerNoteField(overlay)).toEqual({});
    handleOfferNoteTap(overlay, overlay.querySelector('[data-trade-note-id="grow-in-peace"]'));
    expect(offerNoteField(overlay)).toEqual({ note: "grow-in-peace" });
    handleOfferNoteTap(overlay, overlay.querySelector('[data-trade-note-id="grow-in-peace"]'));
    expect(offerNoteField(overlay)).toEqual({});
  });

  it("hides for AI rulers and goods-only deals, and drops a truce line when the offer becomes an alliance", () => {
    const overlay = overlayWithRow();
    syncOfferNoteRow(overlay, "truce", true);
    expect(overlay.querySelector<HTMLElement>("[data-trade-note]")!.hidden).toBe(true);
    syncOfferNoteRow(overlay, "trade", false);
    expect(overlay.querySelector<HTMLElement>("[data-trade-note]")!.hidden).toBe(true);
    syncOfferNoteRow(overlay, "truce", false);
    handleOfferNoteTap(overlay, overlay.querySelector('[data-trade-note-id="quiet-border"]'));
    syncOfferNoteRow(overlay, "alliance", false);
    expect(offerNoteField(overlay)).toEqual({});
    expect(overlay.textContent).toContain("Join me against our common enemy?");
  });
});
