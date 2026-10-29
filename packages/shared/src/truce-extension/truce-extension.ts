// Extending a running truce: a truce offer between empires already at truce
// adds its hours to the current end instead of being refused. A truce can
// never run more than TRUCE_EXTENSION_MAX_AHEAD_MS past now, so two empires
// can't lock in a season-long peace in one deal.
import type { AiDiplomacyPricing } from "../diplomacy-terms/diplomacy-terms.js";

export const TRUCE_EXTENSION_MAX_AHEAD_MS = 48 * 60 * 60_000;

/** The truce's new end after adding `durationHours`, capped at TRUCE_EXTENSION_MAX_AHEAD_MS from now. */
export const extendedTruceEndsAt = (endsAt: number, durationHours: 12 | 24, now: number): number =>
  Math.min(Math.max(endsAt, now) + durationHours * 60 * 60_000, now + TRUCE_EXTENSION_MAX_AHEAD_MS);

/** True when adding `durationHours` keeps the truce within TRUCE_EXTENSION_MAX_AHEAD_MS of now. */
export const truceExtensionFits = (endsAt: number, durationHours: 12 | 24, now: number): boolean =>
  Math.max(endsAt, now) + durationHours * 60 * 60_000 <= now + TRUCE_EXTENSION_MAX_AHEAD_MS;

/**
 * An AI prices an extension like a new truce of that length, except it never
 * pays for one: paying for peace ends a war it is losing, and a truce is
 * already holding.
 */
export const extensionPricing = (pricing: AiDiplomacyPricing): AiDiplomacyPricing => {
  const floor = (value: number | null): number | null => (value === null ? null : Math.max(0, value));
  return { ...pricing, required: { ...pricing.required, truce12: floor(pricing.required.truce12), truce24: floor(pricing.required.truce24) } };
};
