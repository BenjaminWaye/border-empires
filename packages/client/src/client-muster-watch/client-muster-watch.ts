// Client-side guard for the muster watch protocol. UNWATCH_MUSTER used to be
// sent unconditionally on every tile-menu close and every non-muster tile
// click — several times a second during active play — and each one became a
// durable server command (submit + validation + persistence attempt) that was
// a no-op when nothing was watched. Tracking the outstanding watch here means
// the server only ever sees an unwatch that actually ends a watch.
export type MusterWatchGuard = {
  /** Record that a WATCH_MUSTER was sent, so a later unwatch is meaningful. */
  noteWatchSent: () => void;
  /**
   * Returns true (and clears the outstanding flag) when an UNWATCH_MUSTER
   * should actually be sent; false when there is nothing to unwatch.
   */
  shouldSendUnwatch: () => boolean;
};

export const createMusterWatchGuard = (): MusterWatchGuard => {
  let watchOutstanding = false;
  return {
    noteWatchSent: () => {
      watchOutstanding = true;
    },
    shouldSendUnwatch: () => {
      if (!watchOutstanding) return false;
      watchOutstanding = false;
      return true;
    }
  };
};
