// The HUD draws at most this many off-screen alert locators at once.
export const PERSISTENT_ALERT_LOCATOR_SLOTS = 3;
// Slots priority alerts (enemy muster flags near the border) may claim ahead
// of nearer alerts. Kept below the slot count so a long hostile border can't
// push every own alert (town unfed, waypoint paused, ...) off the HUD.
export const PRIORITY_LOCATOR_RESERVED_SLOTS = 2;

/**
 * Picks which candidates (already ordered nearest first, off-screen only) get
 * a locator: up to `reserved` priority candidates first, then the remaining
 * slots filled from the other candidates in order, and only then from further
 * priority candidates (so an all-hostile list still fills every slot).
 */
export const pickLocatorSlots = <T>(
  ordered: readonly T[],
  isPriority: (candidate: T) => boolean,
  slots: number = PERSISTENT_ALERT_LOCATOR_SLOTS,
  reserved: number = PRIORITY_LOCATOR_RESERVED_SLOTS
): T[] => {
  const priority = ordered.filter(isPriority);
  const others = ordered.filter((candidate) => !isPriority(candidate));
  const headCount = Math.min(reserved, slots);
  return [...priority.slice(0, headCount), ...others, ...priority.slice(headCount)].slice(0, slots);
};
