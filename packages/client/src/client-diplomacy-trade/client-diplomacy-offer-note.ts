// The trade screen's "Add a message" row: a short free-text note (diplomacy-offer-notes.ts in shared) for a truce,
// alliance or resource trade offer, with the preset lines as one-tap fills for a truce or alliance. Lives apart from
// client-diplomacy-trade.ts, which is near the line cap; the text is kept in the row's own input, so the screen
// needs no new state.
import { OFFER_NOTE_MAX_LENGTH, OFFER_NOTE_TEXT, OFFER_NOTES_FOR, cleanOfferNote, offerNoteRefusal, type OfferNoteId } from "@border-empires/shared";

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The row placed in the deal column, hidden until syncOfferNoteRow shows it. */
export const OFFER_NOTE_ROW_HTML = `<div class="diplomacy-trade-note" data-trade-note hidden>
  <label class="diplomacy-trade-note-label" for="diplomacy-trade-note-input">Add a message</label>
  <div class="diplomacy-trade-note-chips" data-trade-note-chips></div>
  <input id="diplomacy-trade-note-input" class="diplomacy-trade-note-input" data-trade-note-input type="text" maxlength="${OFFER_NOTE_MAX_LENGTH}" autocomplete="off" enterkeyhint="done" placeholder="Optional">
</div>`;

type NoteKind = "truce" | "alliance" | "trade";

const rowOf = (overlay: HTMLElement): HTMLElement | null => overlay.querySelector<HTMLElement>("[data-trade-note]");
const inputOf = (overlay: HTMLElement): HTMLInputElement | null => overlay.querySelector<HTMLInputElement>("[data-trade-note-input]");

const presetsFor = (kind: NoteKind): readonly OfferNoteId[] => (kind === "trade" ? [] : OFFER_NOTES_FOR[kind]);
const isPresetLine = (text: string): boolean => (Object.values(OFFER_NOTE_TEXT) as string[]).includes(text);

/** Marks the preset whose line is in the box, if any. */
export const syncOfferNoteChips = (overlay: HTMLElement): void => {
  const value = inputOf(overlay)?.value.trim() ?? "";
  overlay.querySelectorAll<HTMLElement>("[data-trade-note-id]").forEach((chip) => {
    chip.setAttribute("aria-pressed", String(OFFER_NOTE_TEXT[chip.dataset.tradeNoteId as OfferNoteId] === value));
  });
};

/**
 * Shows the row for the offer being made (`kind`), with that treaty's preset lines. Hidden for gifts and for AI
 * rulers, who answer with their own reasons instead of reading notes. A preset line from the other treaty is
 * cleared when the offer changes; typed text stays.
 */
export const syncOfferNoteRow = (overlay: HTMLElement, kind: string, toAi: boolean): void => {
  const row = rowOf(overlay);
  if (!row) return;
  const noteKind = kind === "truce" || kind === "alliance" || kind === "trade" ? (kind as NoteKind) : undefined;
  row.hidden = !noteKind || toAi;
  if (row.hidden || !noteKind || row.dataset.kind === noteKind) return;
  row.dataset.kind = noteKind;
  const ids = presetsFor(noteKind);
  const input = inputOf(overlay);
  if (input && isPresetLine(input.value.trim()) && !ids.some((id) => OFFER_NOTE_TEXT[id] === input.value.trim())) input.value = "";
  const chips = overlay.querySelector<HTMLElement>("[data-trade-note-chips]");
  if (chips) {
    chips.hidden = ids.length === 0;
    chips.innerHTML = ids
      .map((id) => `<button type="button" class="diplomacy-trade-note-chip" data-trade-note-id="${id}" aria-pressed="false">${esc(OFFER_NOTE_TEXT[id])}</button>`)
      .join("");
  }
  syncOfferNoteChips(overlay);
};

/** A tapped preset fills the box (tapping it again clears it); true when the tap was on a preset. */
export const handleOfferNoteTap = (overlay: HTMLElement, target: EventTarget | null): boolean => {
  const chip = (target as Element | null)?.closest<HTMLElement>("[data-trade-note-id]");
  const input = inputOf(overlay);
  if (!chip || !input) return false;
  const line = OFFER_NOTE_TEXT[chip.dataset.tradeNoteId as OfferNoteId];
  if (!line) return false;
  input.value = input.value.trim() === line ? "" : line;
  syncOfferNoteChips(overlay);
  return true;
};

const typedNote = (overlay: HTMLElement): string | undefined => {
  const row = rowOf(overlay);
  return row && !row.hidden ? inputOf(overlay)?.value : undefined;
};

/** The note as the request field, cleaned as the server will; {} when the box is empty or the row is hidden. */
export const offerNoteField = (overlay: HTMLElement): { note?: string } => {
  const note = cleanOfferNote(typedNote(overlay));
  return note ? { note } : {};
};

/** Why the typed note can't be sent (the server's own check), or undefined. */
export const offerNoteRefusalText = (overlay: HTMLElement): string | undefined => offerNoteRefusal(typedNote(overlay));
