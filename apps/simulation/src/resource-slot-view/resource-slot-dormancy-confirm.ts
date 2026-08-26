import type { ResourceSlotDormancy } from "./resource-slot-view.js";

// A non-empty dormancy result drives disabled build buttons and dormant-structure
// badges client-side, so a false "you're blocked" is far costlier than a stale
// "you're fine" — callers should re-confirm any blocking result against a
// forced-fresh recompute before trusting it. Only true on the already-rare
// "something is blocked" path, so the common all-clear case pays zero extra cost.
export const isResourceSlotDormancyBlocking = (result: ResourceSlotDormancy): boolean =>
  Object.values(result).some((keys) => keys.size > 0);
