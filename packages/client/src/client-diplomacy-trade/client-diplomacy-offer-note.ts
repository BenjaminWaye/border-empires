// The trade screen's "Add a message" row: tap one preset line to attach it to a truce or alliance offer
// (diplomacy-offer-notes.ts in shared). Lives apart from client-diplomacy-trade.ts, which is near the line cap; the
// picked line is kept on the row element itself, so the screen needs no new state.
import { OFFER_NOTE_TEXT, OFFER_NOTES_FOR, isOfferNoteId, type OfferNoteId } from "@border-empires/shared";

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The empty row placed in the deal column; filled by syncOfferNoteRow. */
export const OFFER_NOTE_ROW_HTML = `<div class="diplomacy-trade-note" data-trade-note hidden></div>`;

type TreatyKind = "truce" | "alliance";

const rowOf = (overlay: HTMLElement): HTMLElement | null => overlay.querySelector<HTMLElement>("[data-trade-note]");

/**
 * Shows the lines for the offer being made (`kind`), with the picked one marked. Hidden for goods-only deals and
 * gifts, and for AI rulers, who answer with their own reasons instead of reading notes.
 */
export const syncOfferNoteRow = (overlay: HTMLElement, kind: string, toAi: boolean): void => {
  const row = rowOf(overlay);
  if (!row) return;
  const treaty = kind === "truce" || kind === "alliance" ? (kind as TreatyKind) : undefined;
  row.hidden = !treaty || toAi;
  if (row.hidden || !treaty) return;
  const picked = row.dataset.picked;
  const ids = OFFER_NOTES_FOR[treaty];
  if (picked && !ids.includes(picked as OfferNoteId)) delete row.dataset.picked;
  const signature = `${treaty}|${row.dataset.picked ?? ""}`;
  if (row.dataset.signature === signature) return;
  row.dataset.signature = signature;
  row.innerHTML = `<span class="diplomacy-trade-note-label">Add a message</span>${ids
    .map((id) => `<button type="button" class="diplomacy-trade-note-chip" data-trade-note-id="${id}" aria-pressed="${row.dataset.picked === id}">${esc(OFFER_NOTE_TEXT[id])}</button>`)
    .join("")}`;
};

/** Toggles the tapped line on or off; true when the tap was on a line. */
export const handleOfferNoteTap = (overlay: HTMLElement, target: EventTarget | null): boolean => {
  const chip = (target as Element | null)?.closest<HTMLElement>("[data-trade-note-id]");
  const row = rowOf(overlay);
  if (!chip || !row) return false;
  const id = chip.dataset.tradeNoteId;
  if (row.dataset.picked === id) delete row.dataset.picked;
  else if (id) row.dataset.picked = id;
  row.querySelectorAll<HTMLElement>("[data-trade-note-id]").forEach((other) => other.setAttribute("aria-pressed", String(other.dataset.tradeNoteId === row.dataset.picked)));
  row.dataset.signature = "";
  return true;
};

/** The picked line for an offer of `kind`, as the request field; {} when none is picked or the row is hidden. */
export const offerNoteField = (overlay: HTMLElement): { note?: OfferNoteId } => {
  const row = rowOf(overlay);
  const picked = row && !row.hidden ? row.dataset.picked : undefined;
  return isOfferNoteId(picked) ? { note: picked } : {};
};
