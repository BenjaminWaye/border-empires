// The social-state options a TRUCE_REQUEST / ALLIANCE_REQUEST carries: its
// terms, and the target's id when the client knows it. Addressing by id means
// a human and an AI sharing a display name can't misdirect an offer.
import type { DiplomacyTerms, OfferNoteId } from "@border-empires/shared";

import type { SocialOfferOptions } from "../social-state/social-state-types.js";

export const offerOptionsFor = (message: { terms?: DiplomacyTerms | undefined; targetPlayerId?: string | undefined; note?: OfferNoteId | undefined }): SocialOfferOptions => ({
  ...(message.terms ? { terms: message.terms } : {}),
  ...(message.note ? { note: message.note } : {}),
  ...(message.targetPlayerId ? { targetPlayerId: message.targetPlayerId } : {})
});
