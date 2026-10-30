// Extending a running truce: a truce offer between empires already at truce
// adds its hours to the current end instead of being refused. A truce can
// never last more than TRUCE_MAX_LIFETIME_MS from when it began, however many
// times it is extended, so two empires can't roll a 12h/24h truce over and
// over into weeks of peace.
import type { AiDiplomacyPricing } from "../diplomacy-terms/diplomacy-terms.js";

export const TRUCE_MAX_LIFETIME_MS = 48 * 60 * 60_000;

/** The truce's new end after adding `durationHours`, capped at TRUCE_MAX_LIFETIME_MS after `startedAt`. */
export const extendedTruceEndsAt = (startedAt: number, endsAt: number, durationHours: 12 | 24, now: number): number =>
  Math.min(Math.max(endsAt, now) + durationHours * 60 * 60_000, startedAt + TRUCE_MAX_LIFETIME_MS);

/** True when adding `durationHours` keeps the truce within TRUCE_MAX_LIFETIME_MS of when it began. */
export const truceExtensionFits = (startedAt: number, endsAt: number, durationHours: 12 | 24, now: number): boolean =>
  Math.max(endsAt, now) + durationHours * 60 * 60_000 <= startedAt + TRUCE_MAX_LIFETIME_MS;

/**
 * An AI prices an extension like a new truce of that length, except it never
 * pays for one: paying for peace ends a war it is losing, and a truce is
 * already holding.
 */
export const extensionPricing = (pricing: AiDiplomacyPricing): AiDiplomacyPricing => {
  const floor = (value: number | null): number | null => (value === null ? null : Math.max(0, value));
  return { ...pricing, required: { ...pricing.required, truce12: floor(pricing.required.truce12), truce24: floor(pricing.required.truce24) } };
};
