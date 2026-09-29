import type { SocialActionResult } from "../social-state/social-state-types.js";

export const GUEST_DIPLOMACY_LOCKED_RESULT: Extract<SocialActionResult, { ok: false }> = {
  ok: false,
  code: "GUEST_DIPLOMACY_LOCKED",
  message: "Save your empire to a real account to make alliances and truces."
};

// Guests cannot request or accept alliances or truces: allies share vision
// and dock crossings, and diplomatic dominance sums an allied bloc's
// territory, so free throwaway accounts would be an exploit. Wrapping only
// request and accept is enough — a guest can neither start nor complete one,
// so no alliance or truce involving a guest can form. Reject, cancel and
// break stay available so a guest can still clear offers aimed at them.
export const lockedForGuests = <Args extends unknown[]>(
  session: { isGuest?: boolean },
  action: (...args: Args) => SocialActionResult,
  metrics: { incrementGuestDiplomacyBlockedTotal: () => void }
): ((...args: Args) => SocialActionResult) =>
  session.isGuest === true
    ? () => {
        metrics.incrementGuestDiplomacyBlockedTotal();
        return GUEST_DIPLOMACY_LOCKED_RESULT;
      }
    : action;
