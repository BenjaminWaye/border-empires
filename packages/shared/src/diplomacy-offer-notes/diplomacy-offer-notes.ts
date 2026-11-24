import { z } from "zod";

// A short line a player can attach to a truce or alliance offer (Playtest Run 4: offers arrived as bare numbers, and
// players wanted to say why). Preset lines only, sent as ids: the server passes on a fixed message and never free
// text, so there is nothing to moderate.
export const OFFER_NOTE_TEXT = {
  "grow-in-peace": "Truce while we both grow?",
  "stop-the-bleeding": "This fight costs us both. Let's stop.",
  "quiet-border": "Let's keep our border quiet.",
  "common-enemy": "Join me against our common enemy?",
  "hold-the-region": "Together we hold this region.",
  "grow-together": "Let's grow side by side."
} as const;

export type OfferNoteId = keyof typeof OFFER_NOTE_TEXT;

export const OFFER_NOTE_IDS = Object.keys(OFFER_NOTE_TEXT) as [OfferNoteId, ...OfferNoteId[]];

export const OfferNoteIdSchema = z.enum(OFFER_NOTE_IDS);

/** The lines offered for each treaty, in display order. */
export const OFFER_NOTES_FOR: Readonly<Record<"truce" | "alliance", readonly OfferNoteId[]>> = {
  truce: ["grow-in-peace", "stop-the-bleeding", "quiet-border"],
  alliance: ["common-enemy", "hold-the-region", "grow-together"]
};

export const isOfferNoteId = (value: unknown): value is OfferNoteId =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(OFFER_NOTE_TEXT, value);
