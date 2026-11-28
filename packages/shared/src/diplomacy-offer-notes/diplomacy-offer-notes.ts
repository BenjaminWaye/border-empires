import { z } from "zod";

import { containsBlockedWord } from "../place-name-policy/place-name-policy.js";

// A short plain-text note a player can attach to a truce, alliance (or fealty) or resource trade offer; the
// recipient sees it on the offer card and in the Chronicle. Playtest Run 4 added preset lines (below), and the
// owner then chose free text (First-15 round 1). The presets stay as one-tap fills in the deal screen, and an
// older client still sends a preset's id, which cleanOfferNote turns into its line.
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

/** The preset lines offered for each treaty, in display order. */
export const OFFER_NOTES_FOR: Readonly<Record<"truce" | "alliance", readonly OfferNoteId[]>> = {
  truce: ["grow-in-peace", "stop-the-bleeding", "quiet-border"],
  alliance: ["common-enemy", "hold-the-region", "grow-together"]
};

export const isOfferNoteId = (value: unknown): value is OfferNoteId =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(OFFER_NOTE_TEXT, value);

/** The longest note a recipient is shown; longer ones are cut. */
export const OFFER_NOTE_MAX_LENGTH = 140;

/** On the wire: looser than the cap, so a note that only grows past it in cleaning is cut, not refused as malformed. */
export const OfferNoteSchema = z.string().max(OFFER_NOTE_MAX_LENGTH * 4);

/** A stored note (an offer row, a Chronicle row): already cleaned. */
export const StoredOfferNoteSchema = z.string().min(1).max(OFFER_NOTE_MAX_LENGTH);

// Control and format characters (newlines, bidi overrides, zero-width joiners) and angle brackets: a note is one
// line of plain text, shown escaped wherever it appears, and never markup.
const STRIPPED = /[\p{Cc}\p{Cf}<>]/gu;

/**
 * The note as the recipient will see it: a preset id becomes its line; markup characters and control characters
 * go; whitespace collapses; the result is cut to OFFER_NOTE_MAX_LENGTH. Undefined when nothing is left.
 */
export const cleanOfferNote = (raw: unknown): string | undefined => {
  if (typeof raw !== "string") return undefined;
  if (isOfferNoteId(raw)) return OFFER_NOTE_TEXT[raw];
  // Cut in UTF-16 units (what the stored schema counts), without leaving half of an emoji's surrogate pair.
  const cut = raw.replace(STRIPPED, " ").replace(/\s+/g, " ").trim().slice(0, OFFER_NOTE_MAX_LENGTH);
  const cleaned = cut.replace(/[\uD800-\uDBFF]$/, "").trim();
  return cleaned.length > 0 ? cleaned : undefined;
};

export const OFFER_NOTE_REFUSED_MESSAGE = "Keep your message civil.";

/**
 * Why a note can't be sent, or undefined when it can (an empty note included). The repo's place-name blocklist,
 * checked word by word: matched across the whole line, "of a good" would read as a slur.
 */
export const offerNoteRefusal = (raw: unknown): string | undefined => {
  const note = cleanOfferNote(raw);
  if (!note) return undefined;
  return note.split(" ").some((word) => containsBlockedWord(word)) ? OFFER_NOTE_REFUSED_MESSAGE : undefined;
};
