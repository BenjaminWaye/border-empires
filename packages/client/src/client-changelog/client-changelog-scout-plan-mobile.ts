import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Owner 2026-11-21: the route planner was unusable on a phone and exploring went too fast.
export const SCOUT_PLAN_MOBILE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Scout drone: slower, and fits your phone",
  why: "The route bar ran off a phone screen and covered the manpower gauge, the \"tap here\" marker filled the screen, and the drone uncovered the map too quickly.",
  changes: [
    "The drone flies 1 tile every 3 seconds past your land, and 1 a second over it",
    "The route bar is smaller: one drone count instead of eight coins, and it sits beside the manpower gauge",
    "The 3D route and its stops are bolder",
    "The \"tap here\" marker is a soft glow instead of a large target"
  ]
};
