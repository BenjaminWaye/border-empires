// Truce extensions in the gateway's social state: a truce offer between
// empires already at truce extends that truce (shared truce-extension.ts holds
// the cap and the AI's extension pricing). Kept out of social-state.ts so the
// request/accept paths there stay one call each.
import { extendedTruceEndsAt, TRUCE_EXTENSION_MAX_AHEAD_MS, truceExtensionFits } from "@border-empires/shared";

import type { SocialActiveTruce, SocialTruceRequest } from "./social-state-types.js";

/** Why a truce offer can't be made against the running truce, if it can't. */
export const truceExtensionRequestError = (
  running: SocialActiveTruce | undefined,
  durationHours: 12 | 24,
  now: number
): { ok: false; code: string; message: string } | undefined =>
  running && !truceExtensionFits(running.endsAt, durationHours, now)
    ? { ok: false, code: "TRUCE_EXTENSION_CAP", message: `a truce can run at most ${TRUCE_EXTENSION_MAX_AHEAD_MS / 3_600_000}h ahead` }
    : undefined;

/**
 * An offer is priced (by an AI) and worded as an extension or a new truce when
 * it is made. If the truce has since lapsed, been broken, or been imposed by a
 * Court mandate, accepting it would deliver something else, so it is stale.
 */
export const truceOfferIsStale = (request: SocialTruceRequest, running: SocialActiveTruce | undefined): boolean =>
  Boolean(request.extendsTruce) !== Boolean(running);

export const STALE_TRUCE_OFFER = { ok: false as const, code: "TRUCE_REQUEST_INVALID", message: "the truce changed since this offer was made" };

/**
 * The running truce with the offer's hours added (capped). Agreeing to extend
 * a Court armistice makes it an ordinary truce: the extra hours were
 * negotiated, so they are breakable and survive a campaign reset.
 */
export const extendTruce = (running: SocialActiveTruce, durationHours: 12 | 24, now: number): SocialActiveTruce => {
  const { origin: _origin, ...negotiated } = running;
  return { ...negotiated, endsAt: extendedTruceEndsAt(running.endsAt, durationHours, now) };
};
