// Truce extensions in the gateway's social state: a truce offer between
// empires already at truce extends that truce (shared truce-extension.ts holds
// the cap and the AI's extension pricing). Kept out of social-state.ts so the
// request/accept paths there stay one call each.
import { extendedTruceEndsAt, TRUCE_MAX_LIFETIME_MS, truceExtensionFits } from "@border-empires/shared";

import type { SocialActiveTruce, SocialTruceRequest } from "./social-state-types.js";

/** Why a truce offer can't be made against the running truce, if it can't. */
export const truceExtensionRequestError = (
  running: SocialActiveTruce | undefined,
  durationHours: 12 | 24,
  now: number
): { ok: false; code: string; message: string } | undefined =>
  running && !truceExtensionFits(running.startedAt, running.endsAt, durationHours, now)
    ? { ok: false, code: "TRUCE_EXTENSION_CAP", message: `a truce can last at most ${TRUCE_MAX_LIFETIME_MS / 3_600_000}h in total, extensions included` }
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
  return { ...negotiated, endsAt: extendedTruceEndsAt(running.startedAt, running.endsAt, durationHours, now) };
};

const HOUR_MS = 3_600_000;

/**
 * A new truce's clock starts when it is offered, not when it is accepted: the
 * sender picks the window, and an offer answered late covers only what is left
 * of it. Extensions are not clocked from the offer; they add to the running end.
 */
export const offeredTruceEndsAt = (request: Pick<SocialTruceRequest, "createdAt" | "durationHours">): number =>
  request.createdAt + request.durationHours * HOUR_MS;

/** When an unanswered offer lapses: a new truce's offer lapses with the truce it offers. */
export const truceOfferExpiresAt = (
  request: Pick<SocialTruceRequest, "createdAt" | "durationHours"> & { extendsTruce?: boolean | undefined },
  backstopExpiresAt: number
): number =>
  request.extendsTruce ? backstopExpiresAt : Math.min(backstopExpiresAt, offeredTruceEndsAt(request));

/** Hours of a new truce still left at `now` (what a Coin-per-hour pledge pays for). */
export const offeredTruceHoursLeft = (request: Pick<SocialTruceRequest, "createdAt" | "durationHours">, now: number): number =>
  Math.max(0, offeredTruceEndsAt(request) - now) / HOUR_MS;

/** "15h 59m" left on a truce, for its announcement. */
export const formatTruceTimeLeft = (remainingMs: number): string => {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
};
