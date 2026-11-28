// The social-state options a TRUCE_REQUEST / ALLIANCE_REQUEST carries: its
// terms, its note, and the target's id when the client knows it. Addressing by
// id means a human and an AI sharing a display name can't misdirect an offer.
import { cleanOfferNote, offerNoteRefusal, type DiplomacyTerms } from "@border-empires/shared";

import type { SocialOfferOptions } from "../social-state/social-state-types.js";

export const offerOptionsFor = (message: { terms?: DiplomacyTerms | undefined; targetPlayerId?: string | undefined; note?: string | undefined }): SocialOfferOptions => {
  const note = cleanOfferNote(message.note);
  return {
    ...(message.terms ? { terms: message.terms } : {}),
    ...(note ? { note } : {}),
    ...(message.targetPlayerId ? { targetPlayerId: message.targetPlayerId } : {})
  };
};

/** The ERROR for an offer whose note the blocklist refuses (offerNoteRefusal in shared); undefined when it may be sent. */
export const offerNoteError = (message: { note?: string | undefined }): { ok: false; code: "OFFER_NOTE_REFUSED"; message: string } | undefined => {
  const refusal = offerNoteRefusal(message.note);
  return refusal ? { ok: false, code: "OFFER_NOTE_REFUSED", message: refusal } : undefined;
};
