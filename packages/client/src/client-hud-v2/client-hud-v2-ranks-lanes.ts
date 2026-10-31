// Crest lanes for the ranks race tracks. Crests sit at their exact share of the
// track; when two would overlap, the ones behind step into lanes above and
// below the rail (x unchanged, so nobody looks further ahead than they are) and
// a tick on the rail marks where each laned crest really is.

/** Shares closer than this are drawn as overlapping (a 30px crest on a ~400px track). */
export const LANE_GAP_SHARE = 0.08;
/** Vertical step between lanes, in px: a 30px crest plus a gap. */
export const LANE_STEP_PX = 34;

/** Centre first, then alternately above and below. */
const LANE_ORDER = [0, -1, 1, -2, 2, -3, 3] as const;

export type LanePin = { share: number; priority: number };

/**
 * Lane per pin (same order as `pins`): 0 is on the rail, negative above,
 * positive below. Pins chain into a cluster while each is within
 * LANE_GAP_SHARE of the previous; within a cluster the frontmost (then
 * highest-priority) pin keeps the rail.
 */
export const assignLanes = (pins: readonly LanePin[]): number[] => {
  const order = pins.map((pin, index) => ({ ...pin, index }))
    .sort((a, b) => b.share - a.share || b.priority - a.priority);
  const lanes = new Array<number>(pins.length).fill(0);
  let slot = 0;
  for (let i = 0; i < order.length; i += 1) {
    const prev = order[i - 1];
    const cur = order[i];
    if (!cur) continue;
    slot = prev && prev.share - cur.share < LANE_GAP_SHARE ? slot + 1 : 0;
    lanes[cur.index] = LANE_ORDER[slot % LANE_ORDER.length] ?? 0;
  }
  return lanes;
};
